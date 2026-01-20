let currentImage = null;
let originalImageData = null;

// Обработчики загрузки файлов
document.getElementById('cameraInput').addEventListener('change', handleFileSelect);
document.getElementById('fileInput').addEventListener('change', handleFileSelect);

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        currentImage = file;
        displayImage(file);
        processImage(file);
    }
}

function displayImage(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImage = document.getElementById('previewImage');
        previewImage.src = e.target.result;
        
        const img = new Image();
        img.onload = function() {
            originalImageData = img;
        };
        img.src = e.target.result;
        
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function preprocessImage(imageData) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.drawImage(imageData, 0, 0);
    
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i+1] = data[i+2] = gray;
    }
    
    if (document.getElementById('enhanceContrast').checked) {
        const contrast = 1.5;
        const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
        for (let i = 0; i < data.length; i += 4) {
            data[i] = factor * (data[i] - 128) + 128;
            data[i+1] = factor * (data[i+1] - 128) + 128;
            data[i+2] = factor * (data[i+2] - 128) + 128;
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

async function processImage(file) {
    const processingIndicator = document.getElementById('processingIndicator');
    const extractedTextArea = document.getElementById('extractedText');
    const downloadBtn = document.getElementById('downloadBtn');
    const errorMessage = document.getElementById('errorMessage');
    const progressText = document.getElementById('progressText');
    
    processingIndicator.style.display = 'flex';
    extractedTextArea.style.display = 'none';
    downloadBtn.style.display = 'none';
    errorMessage.style.display = 'none';
    
    try {
        progressText.textContent = 'Подготовка изображения...';
        
        if (!originalImageData) {
            await new Promise(r => setTimeout(r, 500));
        }
        
        const processedCanvas = preprocessImage(originalImageData);
        const displayCanvas = document.getElementById('processedCanvas');
        displayCanvas.width = processedCanvas.width;
        displayCanvas.height = processedCanvas.height;
        displayCanvas.getContext('2d').drawImage(processedCanvas, 0, 0);
        
        progressText.textContent = 'Загрузка OCR (может занять время)...';
        
        if (typeof Tesseract === 'undefined') {
            throw new Error('Библиотека Tesseract не найдена. Проверьте подключение к интернету.');
        }

        // Используем самый простой метод recognize, который сам управляет воркером
        const result = await Tesseract.recognize(
            processedCanvas,
            'rus',
            {
                logger: m => {
                    console.log(m);
                    if (m.status === 'recognizing text') {
                        progressText.textContent = `Распознавание: ${Math.round(m.progress * 100)}%`;
                    } else {
                        progressText.textContent = `Статус: ${m.status}`;
                    }
                }
            }
        );

        if (!result || !result.data) {
            throw new Error('Не удалось получить данные от OCR');
        }

        extractedTextArea.value = result.data.text;
        processingIndicator.style.display = 'none';
        extractedTextArea.style.display = 'block';
        downloadBtn.style.display = 'block';
        
    } catch (error) {
        console.error('OCR Error:', error);
        processingIndicator.style.display = 'none';
        errorMessage.innerHTML = `<strong>Ошибка:</strong> ${error.message || error}<br><small>Попробуйте обновить страницу или использовать другой браузер.</small>`;
        errorMessage.style.display = 'block';
    }
}

function reprocessImage() {
    if (currentImage) processImage(currentImage);
}

function downloadText() {
    const text = document.getElementById('extractedText').value;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `чек_${new Date().getTime()}.txt`;
    a.click();
}

function resetApp() {
    location.reload(); // Самый надежный способ сброса состояния
}
