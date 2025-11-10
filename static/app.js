document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. GET HTML ELEMENTS ---
    const fileInput = document.getElementById("csvFileInput");
    const uploadButton = document.getElementById("uploadButton");
    const loadingSpinner = document.getElementById("loadingSpinner");
    const uploadButtonText = document.getElementById("uploadButtonText");
    const resultsSection = document.getElementById("resultsSection");
    const totalTransactionsEl = document.getElementById("totalTransactions");
    const fraudTransactionsEl = document.getElementById("fraudTransactions");
    const tableBody = document.getElementById("tableBody");
    const errorAlert = document.getElementById("errorAlert");

    // Forecast elements
    const forecastButton = document.getElementById("forecastButton");
    const forecastSpinner = document.getElementById("forecastSpinner");
    const forecastButtonText = document.getElementById("forecastButtonText");
    const chartContainer = document.getElementById("chartContainer");
    const forecastChartCanvas = document.getElementById("forecastChart");

    // --- 2. GLOBAL STATE ---
    let allTransactionsData = [];
    let myChart = null;

    // --- 3. EVENT LISTENERS ---
    
    // UPLOAD BUTTON
    uploadButton.addEventListener("click", () => {
        const file = fileInput.files[0];
        if (!file) {
            showAlert("Please select a CSV file first.");
            return;
        }
        setUploadLoading(true);
    
        const formData = new FormData();
        formData.append("file", file);

        fetch("/upload_csv", { // We can use relative paths
            method: "POST",
            body: formData,
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || "Server error"); });
            }
            return response.json();
        })
        .then(data => {
            setUploadLoading(false);
            resultsSection.classList.remove("d-none"); // Show results
            
            totalTransactionsEl.textContent = data.total_transactions;
            fraudTransactionsEl.textContent = data.transactions_flagged_as_fraud;
            
            allTransactionsData = data.all_transactions;
            populateTable(allTransactionsData);
        })
        .catch(error => {
            setUploadLoading(false);
            showAlert("Error processing file: " + error.message);
        });
    });

    // FORECAST BUTTON
    forecastButton.addEventListener("click", () => {
        if (allTransactionsData.length === 0) {
            showAlert("Please upload and analyze a transaction file first.");
            return;
        }

        setForecastLoading(true);

        fetch("/forecast", { // We can use relative paths
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(allTransactionsData),
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || "Server error"); });
            }
            return response.json();
        })
        .then(data => {
            setForecastLoading(false);
            chartContainer.classList.remove("d-none");
            drawForecastChart(data.forecast);
        })
        .catch(error => {
            setForecastLoading(false);
            showAlert("Error generating forecast: " + error.message);
        });
    });


    // --- 4. HELPER FUNCTIONS ---

    function populateTable(transactions) {
        tableBody.innerHTML = "";
        transactions.forEach(tx => {
            const row = document.createElement("tr");
            
            // Use Bootstrap's danger class for fraud
            if (tx.is_fraud === 1) {
                row.classList.add("table-danger");
            }
            
            row.innerHTML = `
                <td>${tx.id}</td>
                <td>${tx.Description || 'N/A'}</td>
                <td>$${tx.Amount.toFixed(2)}</td>
                <td>${tx.category}</td>
                <td>${tx.is_fraud === 1 ? 'Yes' : 'No'}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function drawForecastChart(forecastData) {
        if (myChart) {
            myChart.destroy();
        }

        const labels = forecastData.map(item => item.ds);
        const predicted = forecastData.map(item => item.yhat);
        const lowerBound = forecastData.map(item => item.yhat_lower);
        const upperBound = forecastData.map(item => item.yhat_upper);

        const ctx = forecastChartCanvas.getContext("2d");
        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Forecast',
                        data: predicted,
                        borderColor: '#0a9396', // Greenish-blue
                        backgroundColor: 'transparent',
                        borderWidth: 3,
                        tension: 0.1
                    },
                    {
                        label: 'Uncertainty Range',
                        data: upperBound,
                        fill: '+1',
                        backgroundColor: 'rgba(10, 147, 150, 0.1)', // Light fill
                        borderColor: 'transparent',
                        pointRadius: 0,
                    },
                    {
                        label: 'Lower Bound',
                        data: lowerBound,
                        fill: false,
                        borderColor: 'transparent',
                        pointRadius: 0,
                        showInLegend: false,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Predicted Spend ($)' } },
                    x: { title: { display: true, text: 'Date' } }
                }
            }
        });
    }

    // --- 5. UI CONTROL FUNCTIONS ---

    function setUploadLoading(isLoading) {
        if (isLoading) {
            uploadButtonText.textContent = "Analyzing...";
            loadingSpinner.classList.remove("d-none");
            uploadButton.disabled = true;
            errorAlert.classList.add("d-none"); // Hide old errors
        } else {
            uploadButtonText.textContent = "Analyze";
            loadingSpinner.classList.add("d-none");
            uploadButton.disabled = false;
        }
    }

    function setForecastLoading(isLoading) {
        if (isLoading) {
            forecastButtonText.textContent = "Generating...";
            forecastSpinner.classList.remove("d-none");
            forecastButton.disabled = true;
            errorAlert.classList.add("d-none"); // Hide old errors
        } else {
            forecastButtonText.textContent = "Generate 30-Day Forecast";
            forecastSpinner.classList.add("d-none");
            forecastButton.disabled = false;
        }
    }
    
    function showAlert(message) {
        errorAlert.textContent = message;
        errorAlert.classList.remove("d-none");
    }
});