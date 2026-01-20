let currentImage = null;
let originalImageData = null;
let worker = null;

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
        
        // Сохраняем оригинальные данные
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

// Функции предобработки изображения
function preprocessImage(imageData) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.drawImage(imageData, 0, 0);
    
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    // 1. Конвертация в градации серого
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
    }
    
    // 2. Усиление контраста (если включено)
    if (document.getElementById('enhanceContrast').checked) {
        const contrast = 1.5;
        const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = factor * (data[i] - 128) + 128;
            data[i + 1] = factor * (data[i + 1] - 128) + 128;
            data[i + 2] = factor * (data[i + 2] - 128) + 128;
        }
    }
    
    // 3. Удаление шума (медианный фильтр упрощенный, если включено)
    if (document.getElementById('denoise').checked) {
        imgData = denoise(imgData, canvas.width, canvas.height);
    }
    
    // 4. Увеличение резкости (если включено)
    if (document.getElementById('sharpen').checked) {
        imgData = sharpen(imgData, canvas.width, canvas.height);
    }
    
    // 5. Бинаризация (черно-белый режим, если включено)
    if (document.getElementById('binarize').checked) {
        imgData = binarize(imgData);
    }
    
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

function denoise(imgData, width, height) {
    const data = imgData.data;
    const output = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const neighbors = [];
            
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nIdx = ((y + dy) * width + (x + dx)) * 4;
                    neighbors.push(data[nIdx]);
                }
            }
            
            neighbors.sort((a, b) => a - b);
            const median = neighbors[4];
            
            output[idx] = median;
            output[idx + 1] = median;
            output[idx + 2] = median;
        }
    }
    
    return new ImageData(output, width, height);
}

function sharpen(imgData, width, height) {
    const data = imgData.data;
    const output = new Uint8ClampedArray(data);
    
    // Kernel для повышения резкости
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let sum = 0;
            
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const kIdx = (ky + 1) * 3 + (kx + 1);
                    sum += data[idx] * kernel[kIdx];
                }
            }
            
            const idx = (y * width + x) * 4;
            output[idx] = Math.min(255, Math.max(0, sum));
            output[idx + 1] = Math.min(255, Math.max(0, sum));
            output[idx + 2] = Math.min(255, Math.max(0, sum));
        }
    }
    
    return new ImageData(output, width, height);
}

function binarize(imgData) {
    const data = imgData.data;
    
    // Вычисляем порог методом Otsu
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
        histogram[data[i]]++;
    }
    
    const total = data.length / 4;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
        sum += i * histogram[i];
    }
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 0;
    
    for (let i = 0; i < 256; i++) {
        wB += histogram[i];
        if (wB === 0) continue;
        
        wF = total - wB;
        if (wF === 0) break;
        
        sumB += i * histogram[i];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const variance = wB * wF * (mB - mF) * (mB - mF);
        
        if (variance > maxVariance) {
            maxVariance = variance;
            threshold = i;
        }
    }
    
    // Применяем порог
    for (let i = 0; i < data.length; i += 4) {
        const value = data[i] > threshold ? 255 : 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
    }
    
    return imgData;
}

async function processImage(file) {
    const processingIndicator = document.getElementById('processingIndicator');
    const extractedTextArea = document.getElementById('extractedText');
    const downloadBtn = document.getElementById('downloadBtn');
    const errorMessage = document.getElementById('errorMessage');
    const progressText = document.getElementById('progressText');
    
    // Показываем индикатор загрузки
    processingIndicator.style.display = 'flex';
    extractedTextArea.style.display = 'none';
    downloadBtn.style.display = 'none';
    errorMessage.style.display = 'none';
    
    try {
        progressText.textContent = 'Предобработка изображения...';
        
        // Ждем загрузки оригинального изображения
        await new Promise((resolve, reject) => {
            if (originalImageData && originalImageData.complete) resolve();
            else {
                const timeout = setTimeout(() => reject(new Error('Таймаут загрузки изображения')), 5000);
                const check = setInterval(() => {
                    if (originalImageData && originalImageData.complete) {
                        clearInterval(check);
                        clearTimeout(timeout);
                        resolve();
                    }
                }, 100);
            }
        });
        
        // Предобработка
        const processedCanvas = preprocessImage(originalImageData);
        
        // Показываем обработанное изображение
        const displayCanvas = document.getElementById('processedCanvas');
        displayCanvas.width = processedCanvas.width;
        displayCanvas.height = processedCanvas.height;
        const displayCtx = displayCanvas.getContext('2d');
        displayCtx.drawImage(processedCanvas, 0, 0);
        
        progressText.textContent = 'Инициализация OCR...';
        
        // Проверяем наличие Tesseract
        if (typeof Tesseract === 'undefined') {
            throw new Error('Библиотека Tesseract не загружена. Проверьте интернет-соединение.');
        }

        // Создаем воркер Tesseract
        worker = await Tesseract.createWorker({
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    progressText.textContent = `Распознавание: ${progress}%`;
                } else {
                    progressText.textContent = m.status;
                }
            }
        });
        
        await worker.loadLanguage('rus');
        await worker.initialize('rus');
        
        // Настройки для лучшего распознавания чеков
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя.,:-+=/*()[]{}#№@_ ',
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        });
        
        // Распознаем текст
        const { data: { text } } = await worker.recognize(processedCanvas);
        
        // Отображаем результат
        extractedTextArea.value = text;
        processingIndicator.style.display = 'none';
        extractedTextArea.style.display = 'block';
        downloadBtn.style.display = 'block';
        
    } catch (error) {
        console.error('Ошибка при обработке:', error);
        processingIndicator.style.display = 'none';
        errorMessage.textContent = 'Ошибка: ' + (error.message || 'Неизвестная ошибка');
        errorMessage.style.display = 'block';
    } finally {
        if (worker) {
            await worker.terminate();
            worker = null;
        }
    }
}

function reprocessImage() {
    if (currentImage) {
        processImage(currentImage);
    }
}

function downloadText() {
    const text = document.getElementById('extractedText').value;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `чек_${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetApp() {
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('extractedText').value = '';
    document.getElementById('cameraInput').value = '';
    document.getElementById('fileInput').value = '';
    currentImage = null;
    originalImageData = null;
}
