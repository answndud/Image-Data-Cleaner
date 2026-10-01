        // ============================================
        // Image Data Cleaner - Main Application
        // ============================================

        // State
        let currentFile = null;
        let currentImage = null;
        let exifData = null;
        let cleanedBlob = null;
        let currentObjectUrl = null;
        let operationToken = 0;
        let batchResults = [];

        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        const MAX_OUTPUT_DIMENSION = 4096;
        const SUPPORTED_EXTENSIONS = /\.(jpe?g|png|webp|tiff?|avif|heic|heif)$/i;
        const SENSITIVE_METADATA_PATTERN = /^(GPS|Date|Time|Make$|Model$|Lens|Software$|Artist$|Copyright$|Owner|Serial|ImageUniqueID|Description$|Title$|Subject$|Rights$|Creator|Rating|Label|xmp$|iptc$|icc$|Profile)/i;

        // DOM Elements
        const uploadZone = document.getElementById('uploadZone');
        const imageInput = document.getElementById('imageInput');
        const imagePreview = document.getElementById('imagePreview');
        const imageInfo = document.getElementById('imageInfo');
        const noExif = document.getElementById('noExif');
        const noExifFound = document.getElementById('noExifFound');
        const exifSection = document.getElementById('exifSection');
        const gpsPreview = document.getElementById('gpsPreview');
        const resultSection = document.getElementById('resultSection');
        const clearBtn = document.getElementById('clearBtn');
        const removeExifBtn = document.getElementById('removeExifBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const processingStatus = document.getElementById('processingStatus');
        const outputFormat = document.getElementById('outputFormat');
        const jpegQuality = document.getElementById('jpegQuality');
        const jpegQualityValue = document.getElementById('jpegQualityValue');
        const downscaleLargeImages = document.getElementById('downscaleLargeImages');
        const verificationStatus = document.getElementById('verificationStatus');
        const batchSection = document.getElementById('batchSection');
        const batchSummary = document.getElementById('batchSummary');
        const batchList = document.getElementById('batchList');
        const downloadAllBtn = document.getElementById('downloadAllBtn');
        const infoSection = document.querySelector('.info-section');
        const infoSectionToggle = document.getElementById('infoSectionToggle');
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');

        if (infoSection && infoSectionToggle) {
            infoSection.classList.add('collapsed');
            infoSectionToggle.setAttribute('aria-expanded', 'false');
            const toggleInfoSection = () => {
                const collapsed = infoSection.classList.toggle('collapsed');
                infoSectionToggle.setAttribute('aria-expanded', String(!collapsed));
            };
            infoSectionToggle.addEventListener('click', toggleInfoSection);
            infoSectionToggle.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleInfoSection();
                }
            });
        }

        // ============================================
        // File Upload Handling
        // ============================================
        uploadZone.addEventListener('click', (event) => {
            if (event.target !== imageInput) imageInput.click();
        });

        uploadZone.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                imageInput.click();
            }
        });

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        imageInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });

        jpegQuality.addEventListener('input', () => {
            jpegQualityValue.value = `${Math.round(Number(jpegQuality.value) * 100)}%`;
            jpegQualityValue.textContent = `${Math.round(Number(jpegQuality.value) * 100)}%`;
        });

        function isSupportedFile(file) {
            return Boolean(file && ((file.type && file.type.startsWith('image/')) || SUPPORTED_EXTENSIONS.test(file.name)));
        }

        function validateFiles(fileList) {
            const files = Array.from(fileList || []);
            const validFiles = [];
            files.forEach((file) => {
                if (!isSupportedFile(file)) {
                    showToast(`${file.name}: 지원하지 않는 이미지 형식입니다.`, 'error');
                } else if (file.size > MAX_FILE_SIZE) {
                    showToast(`${file.name}: 50MB 이하의 파일만 처리할 수 있습니다.`, 'error');
                } else {
                    validFiles.push(file);
                }
            });
            return validFiles;
        }

        async function handleFiles(fileList) {
            const files = validateFiles(fileList);
            imageInput.value = '';
            if (!files.length) return;
            if (files.length === 1) {
                await handleFile(files[0]);
                return;
            }
            await processBatch(files);
        }

        function releaseCurrentObjectUrl() {
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
                currentObjectUrl = null;
            }
        }

        function resetMetadataView() {
            noExif.style.display = 'block';
            noExifFound.style.display = 'none';
            exifSection.classList.remove('visible');
            gpsPreview.classList.remove('visible');
            document.getElementById('allExifBody').replaceChildren();
            document.getElementById('allExifToggle').classList.remove('expanded');
            document.getElementById('allExifToggle').setAttribute('aria-expanded', 'false');
            document.getElementById('allExifTable').classList.remove('expanded');
            document.querySelectorAll('.exif-category').forEach((category) => {
                category.style.display = 'block';
            });
        }

        function resetCurrentView() {
            releaseCurrentObjectUrl();
            currentFile = null;
            currentImage = null;
            exifData = null;
            cleanedBlob = null;
            imagePreview.removeAttribute('src');
            imagePreview.alt = '선택한 이미지 미리보기';
            uploadZone.classList.remove('has-image');
            imageInfo.classList.remove('visible');
            resultSection.classList.remove('visible');
            processingStatus.textContent = '';
            clearBtn.disabled = true;
            removeExifBtn.disabled = true;
            removeExifBtn.textContent = '메타데이터 삭제';
            resetMetadataView();
        }

        async function handleFile(file) {
            const token = ++operationToken;
            resetCurrentView();
            batchResults = [];
            batchSection.hidden = true;
            batchList.replaceChildren();
            batchSummary.textContent = '';
            downloadAllBtn.disabled = true;
            currentFile = file;
            clearBtn.disabled = false;
            updateImageInfo(file, { width: '분석 중', height: '분석 중' });
            processingStatus.textContent = '이미지를 읽는 중...';
            removeExifBtn.textContent = '이미지 읽는 중...';
            removeExifBtn.disabled = true;

            try {
                const loaded = await loadImage(file);
                if (token !== operationToken) {
                    URL.revokeObjectURL(loaded.url);
                    return;
                }
                currentObjectUrl = loaded.url;
                currentImage = loaded.image;
                imagePreview.src = loaded.url;
                imagePreview.alt = `${file.name} 미리보기`;
                uploadZone.classList.add('has-image');
                updateImageInfo(file, loaded.image);
                removeExifBtn.textContent = '메타데이터 삭제';
                removeExifBtn.disabled = false;
            } catch (error) {
                if (token !== operationToken) return;
                showToast('이 이미지 형식은 브라우저 미리보기를 지원하지 않습니다.', 'error');
                updateImageInfo(file, { width: '-', height: '-' });
                removeExifBtn.textContent = '삭제 불가';
                removeExifBtn.disabled = true;
            }

            await extractExifData(file, token);
            if (token === operationToken) {
                processingStatus.textContent = currentImage ? '분석 완료' : '메타데이터 분석 완료 · 미리보기 불가';
            }
        }

        function loadImage(file) {
            const url = URL.createObjectURL(file);
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.decoding = 'async';
                image.onload = () => resolve({ image, url });
                image.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Image decoding failed'));
                };
                image.src = url;
            });
        }

        async function processBatch(files) {
            const token = ++operationToken;
            resetCurrentView();
            batchResults = [];
            batchSection.hidden = false;
            batchList.replaceChildren();
            batchSummary.textContent = `${files.length}개 파일 처리 준비 중...`;
            downloadAllBtn.disabled = true;

            for (let index = 0; index < files.length; index += 1) {
                if (token !== operationToken) return;
                const file = files[index];
                let batchObjectUrl = null;
                batchSummary.textContent = `${index + 1}/${files.length} 처리 중...`;
                try {
                    const metadata = await parseExifData(file);
                    if (token !== operationToken) return;
                    const loaded = await loadImage(file);
                    batchObjectUrl = loaded.url;
                    if (token !== operationToken) return;
                    const result = await createCleanBlob(file, loaded.image);
                    if (token !== operationToken) return;
                    const verification = await verifyCleanBlob(result.blob, metadata);
                    batchResults.push({ file, blob: result.blob, verification, dimensions: result });
                    appendBatchResult(batchResults.length - 1, 'success', verification.message);
                } catch (error) {
                    batchResults.push({ file, error });
                    appendBatchResult(batchResults.length - 1, 'error', error.message || '처리 실패');
                } finally {
                    if (batchObjectUrl) URL.revokeObjectURL(batchObjectUrl);
                }
            }

            if (token !== operationToken) return;
            const successful = batchResults.filter((result) => result.blob).length;
            batchSummary.textContent = `${files.length}개 중 ${successful}개 처리 완료`;
            downloadAllBtn.disabled = successful === 0;
        }

        function appendBatchResult(index, type, message) {
            const result = batchResults[index];
            const row = document.createElement('div');
            row.className = 'batch-result';
            const name = document.createElement('span');
            name.className = 'batch-result-name';
            name.textContent = result.file.name;
            const state = document.createElement('span');
            state.className = `batch-result-state ${type}`;
            state.textContent = type === 'success' ? `완료 · ${message}` : `실패 · ${message}`;
            row.append(name, state);
            if (type === 'success') {
                const button = document.createElement('button');
                button.className = 'btn btn-secondary';
                button.type = 'button';
                button.textContent = '다운로드';
                button.dataset.batchIndex = String(index);
                row.appendChild(button);
            }
            batchList.appendChild(row);
        }

        batchList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-batch-index]');
            if (!button) return;
            const result = batchResults[Number(button.dataset.batchIndex)];
            if (result?.blob) downloadBlob(result.blob, result.file.name);
        });

        downloadAllBtn.addEventListener('click', () => {
            batchResults.filter((result) => result.blob).forEach((result, index) => {
                setTimeout(() => downloadBlob(result.blob, result.file.name), index * 350);
            });
        });

        // Enable buttons after a file has been accepted.

        function updateImageInfo(file, img) {
            document.getElementById('fileName').textContent = truncateText(file.name, 25);
            document.getElementById('fileSize').textContent = formatBytes(file.size);
            document.getElementById('resolution').textContent = `${img.width} × ${img.height}`;
            document.getElementById('fileType').textContent = getDisplayFileType(file);
            imageInfo.classList.add('visible');
        }

        function getDisplayFileType(file) {
            if (file.type && file.type.includes('/')) {
                const subtype = file.type.split('/')[1];
                if (subtype) return subtype.toUpperCase();
            }
            const parts = file.name.split('.');
            const ext = parts.length > 1 ? parts.pop() : '';
            return ext ? ext.toUpperCase() : 'UNKNOWN';
        }

        function truncateText(text, maxLength) {
            if (text.length <= maxLength) return text;
            const ext = text.split('.').pop();
            const name = text.slice(0, -(ext.length + 1));
            return name.slice(0, maxLength - ext.length - 4) + '...' + '.' + ext;
        }

        function formatBytes(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        // ============================================
        // EXIF Data Extraction
        // ============================================
        async function parseExifData(file) {
            const parsed = await exifr.parse(file, true);
            return normalizeExifData(parsed);
        }

        async function extractExifData(file, token) {
            try {
                const parsed = await parseExifData(file);
                if (token !== operationToken) return;
                exifData = parsed;

                if (!exifData || Object.keys(exifData).length === 0) {
                    showNoExif();
                } else {
                    displayExifData(exifData);
                }
            } catch (error) {
                if (token !== operationToken) return;
                console.warn('EXIF 파싱 실패:', error);
                showNoExif();
            }
        }

        function getSensitiveMetadataKeys(data) {
            return Object.keys(data || {}).filter((key) => SENSITIVE_METADATA_PATTERN.test(key));
        }

        async function verifyCleanBlob(blob, originalData) {
            let cleanedData;
            try {
                cleanedData = await parseExifData(blob);
            } catch (error) {
                return {
                    passed: false,
                    removedCount: 0,
                    remainingKeys: [],
                    message: '결과를 다시 읽지 못해 검증할 수 없습니다.'
                };
            }

            const originalKeys = getSensitiveMetadataKeys(originalData);
            const cleanedKeys = getSensitiveMetadataKeys(cleanedData);
            const removedKeys = originalKeys.filter((key) => !cleanedKeys.includes(key));
            const passed = cleanedKeys.length === 0;
            return {
                passed,
                removedCount: removedKeys.length,
                remainingKeys: cleanedKeys,
                message: passed
                    ? `${removedKeys.length}개 민감 메타데이터 제거 확인`
                    : `남은 민감 태그 ${cleanedKeys.length}개: ${cleanedKeys.slice(0, 3).join(', ')}`
            };
        }

        function normalizeExifData(data) {
            if (!data) return null;
            const normalized = {};
            Object.entries(data).forEach(([key, value]) => {
                if (value === undefined) return;
                if (value instanceof Date) {
                    normalized[key] = value.toISOString();
                    return;
                }
                if (Array.isArray(value)) {
                    normalized[key] = value.map(item => item instanceof Date ? item.toISOString() : item);
                    return;
                }
                if (value && typeof value === 'object' && value.numerator !== undefined && value.denominator !== undefined) {
                    normalized[key] = value.numerator / value.denominator;
                    return;
                }
                normalized[key] = value;
            });
            return normalized;
        }

        function showNoExif() {
            noExif.style.display = 'none';
            noExifFound.style.display = 'block';
            exifSection.classList.remove('visible');
            if (currentImage) {
                removeExifBtn.textContent = '메타데이터 삭제';
                removeExifBtn.disabled = false;
            } else {
                removeExifBtn.textContent = '삭제 불가';
                removeExifBtn.disabled = true;
            }
        }

        function displayExifData(data) {
            noExif.style.display = 'none';
            noExifFound.style.display = 'none';
            exifSection.classList.add('visible');

            // Camera Info
            const cameraGrid = document.getElementById('cameraGrid');
            cameraGrid.replaceChildren();
            const cameraFields = [
                { key: 'Make', label: '제조사' },
                { key: 'Model', label: '카메라 모델' },
                { key: 'LensModel', label: '렌즈' },
                { key: 'Software', label: '소프트웨어' }
            ];
            let hasCameraData = false;
            cameraFields.forEach(field => {
                if (data[field.key]) {
                    hasCameraData = true;
                    cameraGrid.appendChild(createExifItem(field.label, data[field.key]));
                }
            });
            document.getElementById('cameraCategory').style.display = hasCameraData ? 'block' : 'none';

            // Date/Time Info
            const dateGrid = document.getElementById('dateGrid');
            dateGrid.replaceChildren();
            const dateFields = [
                { key: 'DateTime', label: '수정 일시' },
                { key: 'DateTimeOriginal', label: '촬영 일시' },
                { key: 'DateTimeDigitized', label: '디지털화 일시' }
            ];
            let hasDateData = false;
            dateFields.forEach(field => {
                if (data[field.key]) {
                    hasDateData = true;
                    const formatted = formatExifDate(data[field.key]);
                    dateGrid.appendChild(createExifItem(field.label, formatted, 'warning'));
                }
            });
            document.getElementById('dateCategory').style.display = hasDateData ? 'block' : 'none';

            // Settings Info
            const settingsGrid = document.getElementById('settingsGrid');
            settingsGrid.replaceChildren();
            const settingsFields = [
                { key: 'ExposureTime', label: '셔터 속도', format: formatExposure },
                { key: 'FNumber', label: '조리개', format: (v) => `f/${formatNumber(v, 1)}` },
                { key: 'ISOSpeedRatings', label: 'ISO' },
                { key: 'FocalLength', label: '초점 거리', format: (v) => `${formatNumber(v, 1)}mm` },
                { key: 'Flash', label: '플래시', format: formatFlash },
                { key: 'WhiteBalance', label: '화이트밸런스', format: formatWhiteBalance }
            ];
            let hasSettingsData = false;
            settingsFields.forEach(field => {
                if (data[field.key] !== undefined) {
                    hasSettingsData = true;
                    let value = data[field.key];
                    if (field.format) {
                        value = field.format(value);
                    }
                    settingsGrid.appendChild(createExifItem(field.label, value));
                }
            });
            document.getElementById('settingsCategory').style.display = hasSettingsData ? 'block' : 'none';

            // XMP / Editing Info
            const xmpGrid = document.getElementById('xmpGrid');
            xmpGrid.replaceChildren();
            const xmpFields = [
                { key: 'xmp', label: 'XMP 원본', format: summarizeXmp },
                { key: 'CreatorTool', label: '작성 도구' },
                { key: 'Label', label: '레이블' },
                { key: 'Rating', label: '평점' },
                { key: 'Description', label: '설명' },
                { key: 'Title', label: '제목' },
                { key: 'Subject', label: '주제' },
                { key: 'Rights', label: '권리' }
            ];
            let hasXmpData = false;
            xmpFields.forEach(field => {
                if (data[field.key] !== undefined && data[field.key] !== null && data[field.key] !== '') {
                    hasXmpData = true;
                    const value = field.format ? field.format(data[field.key]) : data[field.key];
                    xmpGrid.appendChild(createExifItem(field.label, value));
                }
            });
            document.getElementById('xmpCategory').style.display = hasXmpData ? 'block' : 'none';

            // IPTC
            const iptcGrid = document.getElementById('iptcGrid');
            iptcGrid.replaceChildren();
            const iptcFields = [
                { key: 'headline', label: '헤드라인' },
                { key: 'caption', label: '캡션' },
                { key: 'credit', label: '크레딧' },
                { key: 'byline', label: '기자/작성자' },
                { key: 'bylineTitle', label: '작성자 직함' },
                { key: 'keywords', label: '키워드', format: formatListValue },
                { key: 'category', label: '카테고리' },
                { key: 'captionWriter', label: '캡션 작성자' }
            ];
            let hasIptcData = false;
            iptcFields.forEach(field => {
                if (data[field.key] !== undefined && data[field.key] !== null && data[field.key] !== '') {
                    hasIptcData = true;
                    const value = field.format ? field.format(data[field.key]) : data[field.key];
                    iptcGrid.appendChild(createExifItem(field.label, value));
                }
            });
            document.getElementById('iptcCategory').style.display = hasIptcData ? 'block' : 'none';

            // ICC / Color Profile
            const iccGrid = document.getElementById('iccGrid');
            iccGrid.replaceChildren();
            const iccFields = [
                { key: 'ProfileDescription', label: '프로파일 설명' },
                { key: 'ProfileCMMType', label: 'CMM 타입' },
                { key: 'ProfileClass', label: '프로파일 클래스' },
                { key: 'ColorSpaceData', label: '색상 공간' },
                { key: 'RenderingIntent', label: '렌더링 인텐트' },
                { key: 'DeviceModel', label: '디바이스 모델' },
                { key: 'DeviceManufacturer', label: '제조사' }
            ];
            let hasIccData = false;
            iccFields.forEach(field => {
                if (data[field.key] !== undefined && data[field.key] !== null && data[field.key] !== '') {
                    hasIccData = true;
                    iccGrid.appendChild(createExifItem(field.label, data[field.key]));
                }
            });
            document.getElementById('iccCategory').style.display = hasIccData ? 'block' : 'none';

            // Format-specific metadata
            const formatGrid = document.getElementById('formatGrid');
            formatGrid.replaceChildren();
            const formatFields = [
                { key: 'JFIFVersion', label: 'JFIF 버전', format: formatArrayValue },
                { key: 'ResolutionUnit', label: '해상도 단위' },
                { key: 'XResolution', label: '가로 해상도' },
                { key: 'YResolution', label: '세로 해상도' },
                { key: 'ColorType', label: '컬러 타입' },
                { key: 'BitDepth', label: '비트 깊이' },
                { key: 'ImageWidth', label: '이미지 너비' },
                { key: 'ImageHeight', label: '이미지 높이' }
            ];
            let hasFormatData = false;
            formatFields.forEach(field => {
                if (data[field.key] !== undefined && data[field.key] !== null && data[field.key] !== '') {
                    hasFormatData = true;
                    const value = field.format ? field.format(data[field.key]) : data[field.key];
                    formatGrid.appendChild(createExifItem(field.label, value));
                }
            });
            document.getElementById('formatCategory').style.display = hasFormatData ? 'block' : 'none';

            // GPS Data
            displayGPSData(data);

            // All EXIF Table
            displayAllExif(data);
        }

        function createExifItem(label, value, className = '') {
            const div = document.createElement('div');
            div.className = `exif-item ${className}`;
            const key = document.createElement('div');
            key.className = 'exif-key';
            key.textContent = label;
            const val = document.createElement('div');
            val.className = 'exif-value';
            val.textContent = String(value);
            div.append(key, val);
            return div;
        }

        function formatExifDate(dateStr) {
            // EXIF date format: "YYYY:MM:DD HH:MM:SS"
            const parts = String(dateStr).split(' ');
            if (parts.length === 2) {
                const dateParts = parts[0].split(':');
                return `${dateParts[0]}년 ${dateParts[1]}월 ${dateParts[2]}일 ${parts[1]}`;
            }
            return String(dateStr);
        }

        function formatExposure(value) {
            const num = Number(value);
            if (!Number.isFinite(num)) return String(value);
            if (num < 1) {
                return `1/${Math.round(1 / num)}초`;
            }
            return `${num.toFixed(2)}초`;
        }

        function formatFlash(value) {
            const flashModes = {
                0: '발광 안함',
                1: '발광',
                5: '발광 (리턴 감지 안됨)',
                7: '발광 (리턴 감지됨)',
                9: '강제 발광',
                13: '강제 발광 (리턴 감지 안됨)',
                15: '강제 발광 (리턴 감지됨)',
                16: '발광 안함 (강제)',
                24: '자동, 발광 안함',
                25: '자동, 발광',
                29: '자동, 발광 (리턴 감지 안됨)',
                31: '자동, 발광 (리턴 감지됨)'
            };
            return flashModes[value] || `알 수 없음 (${value})`;
        }

        function formatWhiteBalance(value) {
            return value === 0 ? '자동' : '수동';
        }

        function formatListValue(value) {
            if (Array.isArray(value)) {
                return value.map(item => String(item)).join(', ');
            }
            return String(value);
        }

        function formatArrayValue(value) {
            if (Array.isArray(value)) {
                return value.map(item => String(item)).join('.');
            }
            return String(value);
        }

        function formatNumber(value, digits = 1) {
            const num = Number(value);
            if (!Number.isFinite(num)) return String(value);
            return num.toFixed(digits);
        }

        function summarizeXmp(value) {
            if (typeof value === 'string') {
                const compact = value.replace(/\s+/g, ' ').trim();
                return compact.length > 160 ? `${compact.slice(0, 160)}…` : compact;
            }
            if (value && typeof value === 'object') {
                const keys = Object.keys(value);
                return keys.length ? `${keys.length}개 필드` : '비어 있음';
            }
            return String(value);
        }

        function displayGPSData(data) {
            const hasGPS = data.GPSLatitude !== undefined && data.GPSLatitude !== null
                && data.GPSLongitude !== undefined && data.GPSLongitude !== null;

            if (hasGPS) {
                const lat = convertGPSValue(data.GPSLatitude, data.GPSLatitudeRef, 90);
                const lng = convertGPSValue(data.GPSLongitude, data.GPSLongitudeRef, 180);
                if (lat === null || lng === null) {
                    gpsPreview.classList.remove('visible');
                    return;
                }

                document.getElementById('gpsLat').textContent = `${lat.toFixed(6)}° ${data.GPSLatitudeRef || 'N'}`;
                document.getElementById('gpsLng').textContent = `${lng.toFixed(6)}° ${data.GPSLongitudeRef || 'E'}`;

                // Google Maps link
                const mapLink = document.getElementById('gpsMapLink');
                mapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;

                gpsPreview.classList.add('visible');
            } else {
                gpsPreview.classList.remove('visible');
            }
        }

        function convertGPSValue(value, ref, maxAbs = 180) {
            if (typeof value === 'number') {
                if (!Number.isFinite(value)) return null;
                const result = (ref === 'S' || ref === 'W') ? -Math.abs(value) : value;
                return Math.abs(result) <= maxAbs ? result : null;
            }

            if (!Array.isArray(value) || value.length < 3) return null;

            const parts = value.map(part => {
                if (part && typeof part === 'object' && part.numerator !== undefined && part.denominator !== undefined) {
                    return part.numerator / part.denominator;
                }
                return Number(part);
            });

            if (parts.some(part => !Number.isFinite(part))) return null;

            let dd = parts[0] + parts[1] / 60 + parts[2] / 3600;
            if (ref === 'S' || ref === 'W') dd = -dd;
            return Math.abs(dd) <= maxAbs ? dd : null;
        }

        function escapeMarkdownCell(value) {
            return String(value ?? '')
                .replace(/\|/g, '\\|')
                .replace(/\r?\n/g, ' ')
                .trim();
        }

        function displayAllExif(data) {
            const tbody = document.getElementById('allExifBody');
            tbody.replaceChildren();

            const sensitiveKeys = ['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef',
                                   'DateTime', 'DateTimeOriginal', 'DateTimeDigitized', 'xmp', 'Description', 'Title', 'Subject', 'Rights'];

            Object.entries(data).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    const tr = document.createElement('tr');
                    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    const isSensitive = sensitiveKeys.includes(key);

                    const tdKey = document.createElement('td');
                    tdKey.textContent = key;
                    const tdValue = document.createElement('td');
                    if (isSensitive) {
                        tdValue.style.color = 'var(--error)';
                    }
                    tdValue.textContent = displayValue;
                    tr.append(tdKey, tdValue);
                    tbody.appendChild(tr);
                }
            });
        }

        // Toggle all EXIF table
        document.getElementById('allExifToggle').addEventListener('click', function() {
            const expanded = this.classList.toggle('expanded');
            this.setAttribute('aria-expanded', String(expanded));
            document.getElementById('allExifTable').classList.toggle('expanded', expanded);
        });

        // ============================================
        // Download EXIF as Markdown
        // ============================================
        document.getElementById('downloadExifMdBtn').addEventListener('click', () => {
            if (!exifData || !currentFile) return;

            const markdown = generateExifMarkdown(exifData, currentFile);
            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const originalName = currentFile.name.replace(/\.[^/.]+$/, '');
            const fileName = `${originalName}_exif.md`;

            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);

            showToast('EXIF 정보가 마크다운 파일로 저장되었습니다!', 'success');
        });

        function generateExifMarkdown(data, file) {
            const now = new Date().toLocaleString('ko-KR');
            let md = `# EXIF 메타데이터 리포트\n\n`;
            md += `> 생성일시: ${now}\n\n`;
            md += `---\n\n`;

            // File Info
            md += `## 파일 정보\n\n`;
            md += `| 항목 | 값 |\n`;
            md += `|------|----|\n`;
            md += `| 파일명 | \`${escapeMarkdownCell(file.name)}\` |\n`;
            md += `| 파일 크기 | ${escapeMarkdownCell(formatBytes(file.size))} |\n`;
            md += `| 파일 형식 | ${escapeMarkdownCell(file.type)} |\n`;
            if (currentImage) {
                md += `| 해상도 | ${currentImage.width} × ${currentImage.height} px |\n`;
            }
            md += `\n`;

            // Camera Info
            const cameraFields = [
                { key: 'Make', label: '제조사' },
                { key: 'Model', label: '카메라 모델' },
                { key: 'LensModel', label: '렌즈' },
                { key: 'Software', label: '소프트웨어' }
            ];
            const cameraData = cameraFields.filter(f => data[f.key]);
            if (cameraData.length > 0) {
                md += `## 카메라 정보\n\n`;
                md += `| 항목 | 값 |\n`;
                md += `|------|----|\n`;
                cameraData.forEach(f => {
                md += `| ${escapeMarkdownCell(f.label)} | ${escapeMarkdownCell(data[f.key])} |\n`;
                });
                md += `\n`;
            }

            // Date/Time Info
            const dateFields = [
                { key: 'DateTime', label: '수정 일시' },
                { key: 'DateTimeOriginal', label: '촬영 일시' },
                { key: 'DateTimeDigitized', label: '디지털화 일시' }
            ];
            const dateData = dateFields.filter(f => data[f.key]);
            if (dateData.length > 0) {
                md += `## 날짜 및 시간\n\n`;
                md += `| 항목 | 값 |\n`;
                md += `|------|----|\n`;
                dateData.forEach(f => {
                    md += `| ${escapeMarkdownCell(f.label)} | ${escapeMarkdownCell(formatExifDate(data[f.key]))} |\n`;
                });
                md += `\n`;
            }

            // Settings Info
            const settingsFields = [
                { key: 'ExposureTime', label: '셔터 속도', format: formatExposure },
                { key: 'FNumber', label: '조리개', format: (v) => `f/${formatNumber(v, 1)}` },
                { key: 'ISOSpeedRatings', label: 'ISO' },
                { key: 'FocalLength', label: '초점 거리', format: (v) => `${formatNumber(v, 1)}mm` },
                { key: 'Flash', label: '플래시', format: formatFlash },
                { key: 'WhiteBalance', label: '화이트밸런스', format: formatWhiteBalance },
                { key: 'ExposureMode', label: '노출 모드' },
                { key: 'MeteringMode', label: '측광 모드' }
            ];
            const settingsData = settingsFields.filter(f => data[f.key] !== undefined);
            if (settingsData.length > 0) {
                md += `## 촬영 설정\n\n`;
                md += `| 항목 | 값 |\n`;
                md += `|------|----|\n`;
                settingsData.forEach(f => {
                    let value = data[f.key];
                    if (f.format) {
                        value = f.format(value);
                    }
                    md += `| ${escapeMarkdownCell(f.label)} | ${escapeMarkdownCell(value)} |\n`;
                });
                md += `\n`;
            }

            // XMP Info
            const xmpFields = [
                { key: 'xmp', label: 'XMP 원본', format: summarizeXmp },
                { key: 'CreatorTool', label: '작성 도구' },
                { key: 'Label', label: '레이블' },
                { key: 'Rating', label: '평점' },
                { key: 'Description', label: '설명' },
                { key: 'Title', label: '제목' },
                { key: 'Subject', label: '주제' },
                { key: 'Rights', label: '권리' }
            ];
            const xmpData = xmpFields.filter(f => data[f.key] !== undefined && data[f.key] !== null && data[f.key] !== '');
            if (xmpData.length > 0) {
                md += `## XMP 편집 정보\n\n`;
                md += `| 항목 | 값 |\n`;
                md += `|------|----|\n`;
                xmpData.forEach(f => {
                    const value = f.format ? f.format(data[f.key]) : data[f.key];
                    md += `| ${escapeMarkdownCell(f.label)} | ${escapeMarkdownCell(value)} |\n`;
                });
                md += `\n`;
            }

            // IPTC Info
            const iptcFields = [
                { key: 'headline', label: '헤드라인' },
                { key: 'caption', label: '캡션' },
                { key: 'credit', label: '크레딧' },
                { key: 'byline', label: '기자/작성자' },
                { key: 'bylineTitle', label: '작성자 직함' },
                { key: 'keywords', label: '키워드', format: formatListValue },
                { key: 'category', label: '카테고리' },
                { key: 'captionWriter', label: '캡션 작성자' }
            ];
            const iptcData = iptcFields.filter(f => data[f.key] !== undefined && data[f.key] !== null && data[f.key] !== '');
            if (iptcData.length > 0) {
                md += `## IPTC 설명 정보\n\n`;
                md += `| 항목 | 값 |\n`;
                md += `|------|----|\n`;
                iptcData.forEach(f => {
                    const value = f.format ? f.format(data[f.key]) : data[f.key];
                    md += `| ${escapeMarkdownCell(f.label)} | ${escapeMarkdownCell(value)} |\n`;
                });
                md += `\n`;
            }

            // ICC Info
            const iccFields = [
                { key: 'ProfileDescription', label: '프로파일 설명' },
                { key: 'ProfileCMMType', label: 'CMM 타입' },
                { key: 'ProfileClass', label: '프로파일 클래스' },
                { key: 'ColorSpaceData', label: '색상 공간' },
                { key: 'RenderingIntent', label: '렌더링 인텐트' },
                { key: 'DeviceModel', label: '디바이스 모델' },
                { key: 'DeviceManufacturer', label: '제조사' }
            ];
            const iccData = iccFields.filter(f => data[f.key] !== undefined && data[f.key] !== null && data[f.key] !== '');
            if (iccData.length > 0) {
                md += `## ICC 색상 프로파일\n\n`;
                md += `| 항목 | 값 |\n`;
                md += `|------|----|\n`;
                iccData.forEach(f => {
                    md += `| ${escapeMarkdownCell(f.label)} | ${escapeMarkdownCell(data[f.key])} |\n`;
                });
                md += `\n`;
            }

            // GPS Info
            if (data.GPSLatitude !== undefined && data.GPSLatitude !== null
                && data.GPSLongitude !== undefined && data.GPSLongitude !== null) {
                const lat = convertGPSValue(data.GPSLatitude, data.GPSLatitudeRef, 90);
                const lng = convertGPSValue(data.GPSLongitude, data.GPSLongitudeRef, 180);
                if (lat === null || lng === null) {
                    md += `## GPS 위치 정보\n\n`;
                    md += `> 경고: 이 이미지에는 GPS 정보가 포함되어 있을 수 있지만, 좌표 형식을 해석하지 못했습니다.\n\n`;
                } else {

                    md += `## GPS 위치 정보\n\n`;
                    md += `> 경고: 이 이미지에는 촬영 위치가 포함되어 있습니다.\n\n`;
                    md += `| 항목 | 값 |\n`;
                    md += `|------|----|\n`;
                    md += `| 위도 (Latitude) | ${escapeMarkdownCell(`${lat.toFixed(6)}° ${data.GPSLatitudeRef || 'N'}`)} |\n`;
                    md += `| 경도 (Longitude) | ${escapeMarkdownCell(`${lng.toFixed(6)}° ${data.GPSLongitudeRef || 'E'}`)} |\n`;
                    if (data.GPSAltitude) {
                        md += `| 고도 (Altitude) | ${escapeMarkdownCell(`${data.GPSAltitude}m`)} |\n`;
                    }
                    md += `\n`;
                    md += `[Google Maps에서 보기](https://www.google.com/maps?q=${lat},${lng})\n\n`;
                }
            }

            // All EXIF Data
            md += `## 전체 메타데이터\n\n`;
            md += `| 태그 | 값 |\n`;
            md += `|------|----|\n`;

            const sensitiveKeys = ['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef',
                                   'DateTime', 'DateTimeOriginal', 'DateTimeDigitized', 'xmp', 'Description', 'Title', 'Subject', 'Rights'];

            Object.entries(data).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                    const marker = sensitiveKeys.includes(key) ? ' *' : '';
                    md += `| ${escapeMarkdownCell(key)}${marker} | ${escapeMarkdownCell(displayValue)} |\n`;
                }
            });

            md += `\n---\n\n`;
            md += `*이 파일은 [Image Data Cleaner](https://github.com/answndud/Image-Data-Cleaner)에서 생성되었습니다.*\n`;

            return md;
        }

        // ============================================
        // EXIF Removal (Canvas Re-encoding)
        // ============================================
        removeExifBtn.addEventListener('click', async () => {
            if (!currentImage) {
                showToast('이 형식은 정리할 수 없습니다. 미리보기 가능한 이미지로 다시 시도하세요.', 'error');
                return;
            }

            removeExifBtn.disabled = true;
            removeExifBtn.textContent = '처리 중...';

            try {
                const result = await removeExif();
                if (result) showToast('메타데이터 삭제 및 검증이 완료되었습니다!', 'success');
            } catch (error) {
                showToast('처리 중 오류가 발생했습니다: ' + error.message, 'error');
                removeExifBtn.disabled = false;
                removeExifBtn.textContent = '메타데이터 삭제';
            }
        });

        async function removeExif() {
            const token = operationToken;
            const file = currentFile;
            const image = currentImage;
            processingStatus.textContent = 'Canvas로 이미지 정리 중...';
            const result = await createCleanBlob(file, image);
            if (token !== operationToken) return null;

            processingStatus.textContent = '정리 결과의 메타데이터를 다시 확인하는 중...';
            const verification = await verifyCleanBlob(result.blob, exifData);
            if (token !== operationToken) return null;

            cleanedBlob = result.blob;
            document.getElementById('originalSize').textContent = formatBytes(file.size);
            document.getElementById('cleanedSize').textContent = formatBytes(result.blob.size);
            document.getElementById('dimensionComparison').textContent = `${result.originalWidth}×${result.originalHeight} → ${result.outputWidth}×${result.outputHeight}`;
            document.getElementById('removedMetadataCount').textContent = `${verification.removedCount}개`;
            verificationStatus.textContent = verification.message;
            verificationStatus.className = `verification-status ${verification.passed ? 'success' : 'warning'}`;
            resultSection.classList.add('visible');
            processingStatus.textContent = result.wasResized ? '완료 · 안전한 처리를 위해 해상도를 축소했습니다.' : '정리 및 검증 완료';
            removeExifBtn.disabled = false;
            removeExifBtn.textContent = '메타데이터 다시 삭제';
            return result;
        }

        function getOutputMimeType(file) {
            if (outputFormat.value !== 'auto') return outputFormat.value;
            const type = (file.type || '').toLowerCase();
            if (type === 'image/jpg' || type === 'image/jpeg') return 'image/jpeg';
            if (type === 'image/png' || type === 'image/webp') return type;
            if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
            if (/\.webp$/i.test(file.name)) return 'image/webp';
            return 'image/png';
        }

        function createCleanBlob(file, image) {
            return new Promise((resolve, reject) => {
                try {
                    const originalWidth = image.naturalWidth || image.width;
                    const originalHeight = image.naturalHeight || image.height;
                    const shouldResize = downscaleLargeImages.checked && Math.max(originalWidth, originalHeight) > MAX_OUTPUT_DIMENSION;
                    const scale = shouldResize ? MAX_OUTPUT_DIMENSION / Math.max(originalWidth, originalHeight) : 1;
                    const outputWidth = Math.max(1, Math.round(originalWidth * scale));
                    const outputHeight = Math.max(1, Math.round(originalHeight * scale));
                    canvas.width = outputWidth;
                    canvas.height = outputHeight;
                    ctx.clearRect(0, 0, outputWidth, outputHeight);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(image, 0, 0, outputWidth, outputHeight);

                    const mimeType = getOutputMimeType(file);
                    const quality = mimeType === 'image/jpeg' ? Number(jpegQuality.value) : undefined;
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('이미지 변환에 실패했습니다.'));
                            return;
                        }
                        resolve({ blob, originalWidth, originalHeight, outputWidth, outputHeight, wasResized: shouldResize });
                    }, mimeType, quality);
                } catch (error) {
                    reject(error);
                }
            });
        }

        // ============================================
        // Download Clean Image
        // ============================================
        downloadBtn.addEventListener('click', () => {
            if (!cleanedBlob || !currentFile) return;
            downloadBlob(cleanedBlob, currentFile.name);
            showToast('정리된 이미지가 다운로드되었습니다!', 'success');
        });

        function downloadBlob(blob, originalName) {
            const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'png';
            const baseName = originalName.replace(/\.[^/.]+$/, '');
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${baseName}_clean.${extension}`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        // ============================================
        // Clear / Reset
        // ============================================
        clearBtn.addEventListener('click', () => {
            operationToken += 1;
            resetCurrentView();
            imageInput.value = '';
            batchResults = [];
            batchSection.hidden = true;
            batchList.replaceChildren();
            batchSummary.textContent = '';
            downloadAllBtn.disabled = true;
        });

        // ============================================
        // Toast Notifications
        // ============================================
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;

            const icons = {
                success: 'OK',
                error: 'ERR',
                warning: 'WARN'
            };

            const icon = document.createElement('span');
            icon.textContent = icons[type];
            const text = document.createElement('span');
            text.textContent = message;
            toast.append(icon, text);

            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').catch((error) => {
                    console.warn('오프라인 앱 등록 실패:', error);
                });
            });
        }
