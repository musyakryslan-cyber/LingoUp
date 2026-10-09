
        const STORAGE_KEY = 'lingoup-reading-current-file';
        const fileInput = document.getElementById('documentInput');
        const chooseFileBtn = document.getElementById('chooseFileBtn');
        const deleteFileBtn = document.getElementById('deleteFileBtn');
        const documentViewer = document.getElementById('documentViewer');
        const documentName = document.getElementById('documentName');
        const documentContent = document.getElementById('documentContent');
        const documentTranslation = document.getElementById('documentTranslation');
        const documentImage = document.getElementById('documentImage');
        const pdfPreview = document.getElementById('pdfPreview');
        const documentStatus = document.getElementById('documentStatus');
        const readDocumentBtn = document.getElementById('readDocumentBtn');
        const translateDocumentBtn = document.getElementById('translateDocumentBtn');
        const speechControls = document.getElementById('speechControls');
        const slowSpeechBtn = document.getElementById('slowSpeechBtn');
        const fastSpeechBtn = document.getElementById('fastSpeechBtn');
        const pauseSpeechBtn = document.getElementById('pauseSpeechBtn');

        let currentText = '';
        let activeSpeechUtterance = null;
        let currentSpeechRate = 1;

        function saveStoredDocument(record) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
            } catch (error) {
                console.warn('Не вдалося зберегти файл:', error);
            }
        }

        function clearStoredDocument() {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (error) {
                console.warn('Не вдалося очистити збережений файл:', error);
            }
        }

        function clearDocumentViewer() {
            fileInput.value = '';
            documentName.textContent = 'Без назви';
            documentViewer.classList.remove('visible');
            documentTranslation.classList.remove('visible');
            documentTranslation.textContent = '';
            documentContent.innerHTML = '';
            documentImage.classList.remove('visible');
            documentImage.src = '';
            pdfPreview.classList.remove('visible');
            pdfPreview.innerHTML = '';
            documentStatus.textContent = 'Файл видалено.';
            currentText = '';
            currentSpeechRate = 1;
            speechControls.classList.remove('visible');
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            activeSpeechUtterance = null;
            pauseSpeechBtn.textContent = 'Пауза';
            clearStoredDocument();
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function normalizeText(value) {
            return (value || '')
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .replace(/\u00A0/g, ' ')
                .replace(/[ \t]+/g, ' ')
                .replace(/\n[ \t]+/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        function renderTextInViewer(value) {
            const safeValue = normalizeText(value || '');
            if (!safeValue) {
                documentContent.innerHTML = '<p>Текст відсутній.</p>';
                return;
            }

            const paragraphs = safeValue
                .split(/\n{2,}/)
                .map(block => block.trim())
                .filter(Boolean)
                .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
                .join('');

            documentContent.innerHTML = paragraphs || '<p>Текст відсутній.</p>';
        }

        function renderHtmlInViewer(value) {
            documentContent.innerHTML = value || '<p>Текст відсутній.</p>';
        }

        function simpleTranslate(text) {
            return text
                .replace(/\bI am\b/gi, 'Я є')
                .replace(/\bThis\b/gi, 'Це')
                .replace(/\bis\b/gi, 'є')
                .replace(/\bMy\b/gi, 'Мій')
                .replace(/\bname\b/gi, 'ім\'я')
                .replace(/\bschool\b/gi, 'школа')
                .replace(/\bEnglish\b/gi, 'англійська')
                .replace(/\blearn\b/gi, 'вчити')
                .replace(/\bread\b/gi, 'читати')
                .replace(/\bwrite\b/gi, 'писати')
                .replace(/\btoday\b/gi, 'сьогодні')
                .replace(/\bhello\b/gi, 'привіт')
                .replace(/\bfriend\b/gi, 'друг')
                .replace(/\bwork\b/gi, 'робота')
                .replace(/\bhome\b/gi, 'дім');
        }

        async function renderPdfPreviewFromDataUrl(dataUrl) {
            try {
                if (!dataUrl || typeof pdfjsLib === 'undefined') {
                    return;
                }

                const loadingTask = pdfjsLib.getDocument({ data: atob(dataUrl.split(',')[1]) });
                const pdf = await loadingTask.promise;
                const firstPage = await pdf.getPage(1);
                const viewport = firstPage.getViewport({ scale: 1.2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await firstPage.render({ canvasContext: context, viewport }).promise;
                pdfPreview.innerHTML = '';
                pdfPreview.appendChild(canvas);
                pdfPreview.classList.add('visible');
            } catch (error) {
                pdfPreview.classList.remove('visible');
                pdfPreview.innerHTML = '';
            }
        }

        function renderSavedDocument(record) {
            if (!record) {
                return;
            }

            documentName.textContent = record.name || 'Без назви';
            documentViewer.classList.add('visible');
            documentTranslation.classList.remove('visible');
            currentText = record.text || '';
            documentImage.classList.remove('visible');
            documentImage.src = '';
            pdfPreview.classList.remove('visible');
            pdfPreview.innerHTML = '';

            if (record.kind === 'image' && record.dataUrl) {
                documentImage.src = record.dataUrl;
                documentImage.classList.add('visible');
                renderTextInViewer(record.text || 'Фото завантажено.');
            } else if (record.kind === 'docx' && record.html) {
                renderHtmlInViewer(record.html);
            } else {
                renderTextInViewer(record.text || 'Файл відкрито.');
            }

            if (record.kind === 'pdf' && record.dataUrl) {
                renderPdfPreviewFromDataUrl(record.dataUrl);
            }

            documentStatus.textContent = 'Збережений файл відновлено.';
            speechControls.classList.add('visible');
        }

        async function readTextFromFile(file) {
            const extension = (file.name || '').split('.').pop().toLowerCase();
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('read error'));
                reader.readAsDataURL(file);
            });

            if (file.type.startsWith('image/')) {
                const record = {
                    name: file.name,
                    kind: 'image',
                    type: file.type,
                    dataUrl,
                    text: 'Фото завантажено. Для озвучення та перекладу можна використовувати його текст, якщо він доступний.'
                };
                currentText = record.text;
                documentImage.src = dataUrl;
                documentImage.classList.add('visible');
                pdfPreview.classList.remove('visible');
                pdfPreview.innerHTML = '';
                renderTextInViewer(record.text);
                documentStatus.textContent = 'Фото успішно відкрито.';
                saveStoredDocument(record);
                return;
            }

            if (file.type === 'text/plain' || extension === 'txt') {
                const text = normalizeText(await file.text());
                const record = {
                    name: file.name,
                    kind: 'text',
                    type: file.type,
                    dataUrl,
                    text
                };
                currentText = text;
                renderTextInViewer(text);
                documentImage.classList.remove('visible');
                pdfPreview.classList.remove('visible');
                pdfPreview.innerHTML = '';
                documentStatus.textContent = 'Текстовий файл відкрито.';
                saveStoredDocument(record);
                return;
            }

            if (extension === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let extracted = '';

                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                    const page = await pdf.getPage(pageNumber);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    extracted += pageText + '\n';
                }

                const text = normalizeText(extracted);
                const record = {
                    name: file.name,
                    kind: 'pdf',
                    type: file.type,
                    dataUrl,
                    text
                };
                currentText = text;
                renderTextInViewer(text || 'Текст у PDF не знайдено.');
                documentImage.classList.remove('visible');
                renderPdfPreviewFromDataUrl(dataUrl);
                documentStatus.textContent = 'PDF відкрито і текст витягнуто.';
                saveStoredDocument(record);
                return;
            }

            if (extension === 'docx') {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
                const text = normalizeText(result.value || '');
                const record = {
                    name: file.name,
                    kind: 'docx',
                    type: file.type,
                    dataUrl,
                    text,
                    html: htmlResult.value || '<p>Текст у документі не знайдено.</p>'
                };
                currentText = text;
                renderHtmlInViewer(record.html);
                documentImage.classList.remove('visible');
                pdfPreview.classList.remove('visible');
                pdfPreview.innerHTML = '';
                documentStatus.textContent = 'DOCX відкрито і текст витягнуто.';
                saveStoredDocument(record);
                return;
            }

            const fallbackText = 'Файл завантажено. Для читання та перекладу рекомендується використовувати текстовий файл, PDF або DOCX.';
            const record = {
                name: file.name,
                kind: 'fallback',
                type: file.type,
                dataUrl,
                text: fallbackText
            };
            currentText = fallbackText;
            renderTextInViewer(fallbackText);
            documentImage.classList.remove('visible');
            pdfPreview.classList.remove('visible');
            pdfPreview.innerHTML = '';
            documentStatus.textContent = 'Формат файлу не розпізнано. Показано загальне повідомлення.';
            saveStoredDocument(record);
        }

        chooseFileBtn.addEventListener('click', () => fileInput.click());
        deleteFileBtn.addEventListener('click', clearDocumentViewer);

        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            documentName.textContent = file.name;
            documentViewer.classList.add('visible');
            documentTranslation.classList.remove('visible');
            documentContent.innerHTML = '<p>Завантаження...</p>';
            documentImage.classList.remove('visible');
            documentImage.src = '';
            pdfPreview.classList.remove('visible');
            pdfPreview.innerHTML = '';
            documentStatus.textContent = '';
            currentText = '';
            speechControls.classList.remove('visible');
            pauseSpeechBtn.textContent = 'Пауза';

            await readTextFromFile(file);
        });

        function speakCurrentText(statusMessage = 'Озвучення запущено.') {
            if (!currentText || !('speechSynthesis' in window)) {
                if (!currentText) {
                    documentStatus.textContent = 'Спочатку виберіть файл.';
                } else {
                    documentStatus.textContent = 'Озвучення недоступне в цьому браузері.';
                }
                return;
            }

            const utterance = new SpeechSynthesisUtterance(currentText);
            utterance.lang = 'uk-UA';
            utterance.rate = currentSpeechRate;
            activeSpeechUtterance = utterance;
            speechControls.classList.add('visible');
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
            documentStatus.textContent = statusMessage;
        }

        readDocumentBtn.addEventListener('click', () => {
            speakCurrentText();
        });

        slowSpeechBtn.addEventListener('click', () => {
            if (!('speechSynthesis' in window)) return;
            currentSpeechRate = Math.max(0.5, currentSpeechRate - 0.2);
            if (currentText) {
                speakCurrentText('Швидкість вимови: ' + currentSpeechRate.toFixed(1) + 'x');
            }
        });

        fastSpeechBtn.addEventListener('click', () => {
            if (!('speechSynthesis' in window)) return;
            currentSpeechRate = Math.min(2, currentSpeechRate + 0.2);
            if (currentText) {
                speakCurrentText('Швидкість вимови: ' + currentSpeechRate.toFixed(1) + 'x');
            }
        });

        pauseSpeechBtn.addEventListener('click', () => {
            if (!('speechSynthesis' in window)) return;

            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
                pauseSpeechBtn.textContent = 'Пауза';
                documentStatus.textContent = 'Вимову відновлено.';
                return;
            }

            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.pause();
                pauseSpeechBtn.textContent = 'Продовжити';
                documentStatus.textContent = 'Вимову поставлено на паузу.';
            }
        });

        translateDocumentBtn.addEventListener('click', () => {
            if (!currentText) {
                documentStatus.textContent = 'Спочатку виберіть файл.';
                return;
            }

            const translatedText = simpleTranslate(currentText);
            documentTranslation.textContent = 'Переклад: ' + translatedText;
            documentTranslation.classList.add('visible');
            documentStatus.textContent = 'Переклад показано.';
        });

        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved && saved.name) {
                renderSavedDocument(saved);
            }
        } catch (error) {
            console.warn('Не вдалося відновити збережений файл:', error);
        }
    