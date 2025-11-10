import pandas as pd
import re
import joblib
from flask import Flask, request, jsonify

print("--- Loading models and utilities... ---")

# --- 1. Load Fraud Detection Model & Scaler ---
# We load these once when the server starts.
try:
    model = joblib.load('random_forest_model.joblib')
    scaler = joblib.load('amount_scaler.joblib')
    print("Fraud model and scaler loaded successfully.")
except FileNotFoundError:
    print("Error: Model or scaler files not found.")
    print("Run 01-EDA-and-Model-Prototyping-v2.ipynb to create them.")
    model = None
    scaler = None

# --- 2. Load Transaction Categorizer ---
# We'll copy the function from our notebook directly into this file.
CATEGORY_KEYWORDS = {
    "Groceries": ["WALMART", "KROGER", "SAFEWAY", "PUBLIX", "COSTCO", "SUPERCENTER", "GROCERY"],
    "Gas/Automotive": ["SHELL", "EXXON", "MOBIL", "BP", "CHEVRON", "76", "GAS", "AUTO"],
    "Restaurants/Dining": ["MCDONALD'S", "STARBUCKS", "SUBWAY", "CAFE", "RESTAURANT", "DINER"],
    "Utilities": ["COMCAST", "VERIZON", "AT&T", "T-MOBILE", "ELECTRIC", "WATER", "UTILITY"],
    "Subscriptions/Entertainment": ["NETFLIX", "SPOTIFY", "HULU", "DISNEY+", "AMAZON PRIME", "AMC"],
    "Shopping/General": ["AMAZON", "TARGET", "BEST BUY", "HOME DEPOT", "LOWE'S", "AMZ"],
    "Travel/Transport": ["UBER", "LYFT", "AMERICAN", "DELTA", "AIRLINES", "MARRIOTT", "HOTEL"],
    "Health/Wellness": ["CVS", "WALGREENS", "PHARMACY", "FITNESS", "GYM"],
}

def categorize_transaction(description):
    if not isinstance(description, str):
        return "Miscellaneous"
    
    cleaned_desc = re.sub(r'[^a-zA-Z\s]', ' ', description).upper()
    tokens = set(cleaned_desc.split())

    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in tokens for keyword in keywords):
            return category
            
    return "Miscellaneous"

print("Categorizer function loaded.")


# --- 3. Initialize Flask App ---
app = Flask(__name__)
print("Flask app initialized.")

# --- 4. Define API Endpoints ---

@app.route('/')
def home():
    # A simple route to check if the server is running
    return "ExpenseGuard-AI API is running!"

@app.route('/upload_csv', methods=['POST'])
def upload_csv():
    # Check if a file was sent in the request
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    
    # Check if the file is empty
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        try:
            # Read the uploaded CSV file into a pandas DataFrame
            df = pd.read_csv(file)
            
            # --- 1. PREPARE DATA FOR FRAUD MODEL ---
            
            # Make a copy for processing to avoid changing the original
            df_processed = df.copy()
            
            # Check for 'Amount' column
            if 'Amount' not in df_processed.columns:
                return jsonify({"error": "CSV must contain an 'Amount' column"}), 400
                
            # Scale the 'Amount' column using our saved scaler
            df_processed['Amount'] = scaler.transform(df_processed[['Amount']])
            
            # --- THE FIX IS HERE ---
            # Define the EXACT features the model was trained on
            v_features = [f'V{i}' for i in range(1, 29)] # V1 through V28
            model_features = v_features + ['Amount'] # The 29 features
            
            # Check if all required features are in the uploaded file
            if not all(col in df_processed.columns for col in model_features):
                missing = [col for col in model_features if col not in df_processed.columns]
                return jsonify({"error": f"CSV is missing required model features: {missing}"}), 400
            
            # Select ONLY those features for prediction
            df_features_for_model = df_processed[model_features]
            
            # --- 2. RUN FRAUD DETECTION ---
            # Predict using the correctly-shaped DataFrame
            predictions = model.predict(df_features_for_model)
            
            # Add the predictions to our *original* DataFrame
            df['is_fraud'] = predictions # 1 = Fraud, 0 = Normal
            
            
            # --- 3. RUN CATEGORIZATION ---
            
            # Check for a 'Description' or 'Merchant' column
            if 'Description' in df.columns:
                df['category'] = df['Description'].apply(categorize_transaction)
            else:
                # If no description, we can't categorize, so add a placeholder
                df['category'] = "N/A"
            
            
            # --- 4. PREPARE AND RETURN RESULTS ---
            
            # Get just the fraudulent transactions
            fraudulent_txs = df[df['is_fraud'] == 1]
            
            # Convert our results to JSON-friendly format (a list of dictionaries)
            results_json = df.to_dict(orient='records')
            
            return jsonify({
                "message": "File processed successfully!",
                "total_transactions": len(df),
                "transactions_flagged_as_fraud": int(predictions.sum()),
                "categories_found": df['category'].unique().tolist(),
                "all_transactions": results_json # Send all processed data back
            }), 200

        except Exception as e:
            # This will catch errors like missing columns or bad file types
            return jsonify({"error": f"Error processing file: {str(e)}"}), 500

# --- 5. Run the App ---
if __name__ == '__main__':
    # 'debug=True' will auto-reload the server when you save the file
    app.run(debug=True, port=5000)