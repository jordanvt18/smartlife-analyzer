// SmartLife Analyzer - app.js
// Client-side parsing, dashboard metrics, and local retraining helpers.

if (typeof global === 'undefined') {
    var global = globalThis || window || self;
}

if (typeof process === 'undefined') {
    var process = { env: {} };
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const CHUNK_SIZE = 1 * 1024 * 1024;

let appState = {
    rawData: [],
    processedData: [],
    metricsAvailability: {},
    dataLoaded: false
};

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    document.getElementById(sectionId).classList.add('active');
    event.target.classList.add('active');
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('uploadStatus');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    try {
        if (file.size > MAX_FILE_SIZE) {
            throw new Error(`Archivo demasiado grande (${(file.size / 1048576).toFixed(1)}MB). Máximo permitido: 20MB`);
        }

        progressContainer.style.display = 'block';
        statusDiv.innerHTML = `<div class="status-message status-info">⏳ Procesando ${file.name}...</div>`;

        const text = await readFileInChunks(file, progress => {
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Leyendo archivo: ${progress}%`;
        });

        progressText.textContent = 'Analizando datos...';
        progressBar.style.width = '50%';

        const result = parseMiFitnessData(text);
        if (!result || !result.rows || result.rows.length === 0) {
            throw new Error('No se pudieron extraer datos del archivo. Verifica el formato.');
        }

        progressBar.style.width = '100%';
        progressText.textContent = 'Completado!';

        appState.processedData = result.rows;
        appState.dataLoaded = true;

        statusDiv.innerHTML = `
            <div class="status-message status-success">
                ✅ Archivo procesado exitosamente<br>
                📊 ${result.rows.length} días de datos encontrados<br>
                📅 Rango: ${result.rows[0].date} - ${result.rows[result.rows.length - 1].date}
            </div>
        `;

        document.getElementById('exportControls').style.display = 'block';
        updateDashboard();
        updateQualityReport();

        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('Error processing file:', error);
        statusDiv.innerHTML = `
            <div class="status-message status-error">
                ❌ Error en el procesamiento: ${error.message}
            </div>
        `;
        progressContainer.style.display = 'none';
    }
}

async function readFileInChunks(file, onProgress) {
    const fileSize = file.size;
    let offset = 0;
    let result = '';
    const decoder = new TextDecoder('utf-8');

    while (offset < fileSize) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const arrayBuffer = await chunk.arrayBuffer();
        const text = decoder.decode(arrayBuffer, { stream: offset + CHUNK_SIZE < fileSize });
        result += text;

        offset += CHUNK_SIZE;
        const progress = Math.min(100, Math.round((offset / fileSize) * 100));
        if (onProgress) onProgress(progress);
    }

    return result;
}

function parseMiFitnessData(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0) return null;

    const header = lines[0].trim();
    if (!header.includes('Uid,Sid,Key,Time,Value,UpdateTime')) {
        console.warn('No es formato MiFitness');
        return null;
    }

    const dailyData = {};
    const metricsCount = {};

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        try {
            const parts = line.split(',');
            if (parts.length < 6) continue;

            const key = parts[2];
            const timeStr = parts[3];

            let valueStr = '';
            for (let j = 4; j < parts.length - 1; j++) {
                if (j > 4) valueStr += ',';
                valueStr += parts[j];
            }

            const timestamp = parseInt(timeStr, 10);
            if (Number.isNaN(timestamp)) continue;
            const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

            if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
                valueStr = valueStr.slice(1, -1);
            }
            valueStr = valueStr.replace(/""/g, '"');

            const valueData = JSON.parse(valueStr);

            if (!dailyData[date]) {
                dailyData[date] = {
                    calories: [], spo2: [], heart_rate: [], steps: [], stress: [],
                    valid_stand: [], sleep: [], intensity: [], vitality: [],
                    resting_heart_rate: [], single_heart_rate: [], single_stress: [],
                    single_spo2: [], weight: []
                };
            }

            metricsCount[key] = (metricsCount[key] || 0) + 1;

            switch (key) {
                case 'calories':
                    if (valueData.calories != null) dailyData[date].calories.push(Number(valueData.calories));
                    break;
                case 'spo2':
                    if (valueData.spo2 != null) dailyData[date].spo2.push(Number(valueData.spo2));
                    break;
                case 'heart_rate':
                    if (valueData.bpm != null) dailyData[date].heart_rate.push(Number(valueData.bpm));
                    break;
                case 'steps':
                    if (valueData.steps != null) {
                        dailyData[date].steps.push({
                            steps: Number(valueData.steps),
                            distance: Number(valueData.distance || 0),
                            calories: Number(valueData.calories || 0)
                        });
                    }
                    break;
                case 'stress':
                    if (valueData.stress != null) dailyData[date].stress.push(Number(valueData.stress));
                    break;
                case 'valid_stand':
                    if (valueData.start_time && valueData.end_time) {
                        dailyData[date].valid_stand.push({ duration: valueData.end_time - valueData.start_time });
                    }
                    break;
                case 'sleep':
                    if (valueData.duration != null) {
                        dailyData[date].sleep.push({
                            duration: Number(valueData.duration),
                            deep_duration: Number(valueData.sleep_deep_duration || 0),
                            rem_duration: Number(valueData.sleep_rem_duration || 0),
                            light_duration: Number(valueData.sleep_light_duration || 0),
                            avg_hr: Number(valueData.avg_hr || 0),
                            avg_spo2: Number(valueData.avg_spo2 || 0)
                        });
                    }
                    break;
                case 'intensity':
                    dailyData[date].intensity.push(1);
                    break;
                case 'vitality':
                    if (valueData.latest_accumulated_vitality != null) {
                        dailyData[date].vitality.push(Number(valueData.latest_accumulated_vitality));
                    }
                    break;
                case 'resting_heart_rate':
                    if (valueData.bpm != null) dailyData[date].resting_heart_rate.push(Number(valueData.bpm));
                    break;
                case 'single_heart_rate':
                    if (valueData.bpm != null) dailyData[date].single_heart_rate.push(Number(valueData.bpm));
                    break;
                case 'single_stress':
                    if (valueData.stress != null) dailyData[date].single_stress.push(Number(valueData.stress));
                    break;
                case 'single_spo2':
                    if (valueData.spo2 != null) dailyData[date].single_spo2.push(Number(valueData.spo2));
                    break;
                case 'weight':
                    if (valueData.weight != null) dailyData[date].weight.push(Number(valueData.weight));
                    break;
            }
        } catch (e) {
            console.warn(`Error parsing line ${i}:`, e.message);
        }
    }

    const processedRows = [];
    Object.keys(dailyData).sort().forEach(date => {
        const day = dailyData[date];
        const allHR = [...day.heart_rate, ...day.single_heart_rate, ...day.resting_heart_rate];
        const allStress = [...day.stress, ...day.single_stress];
        const allSpO2 = [...day.spo2, ...day.single_spo2];

        processedRows.push({
            date,
            steps: day.steps.reduce((sum, s) => sum + s.steps, 0),
            calories_burned: day.calories.reduce((sum, c) => sum + c, 0),
            active_minutes: day.intensity.length * 5,
            heart_rate_avg: allHR.length ? Math.round(allHR.reduce((sum, h) => sum + h, 0) / allHR.length) : 0,
            heart_rate_resting: allHR.length ? Math.min(...allHR) : 0,
            sleep_total_minutes: day.sleep.reduce((sum, s) => sum + s.duration, 0),
            sleep_deep_minutes: day.sleep.reduce((sum, s) => sum + s.deep_duration, 0),
            sleep_rem_minutes: day.sleep.reduce((sum, s) => sum + s.rem_duration, 0),
            sleep_light_minutes: day.sleep.reduce((sum, s) => sum + s.light_duration, 0),
            stress_score: allStress.length ? Math.round(allStress.reduce((sum, s) => sum + s, 0) / allStress.length) : 0,
            spo2_avg: allSpO2.length ? Math.round(allSpO2.reduce((sum, s) => sum + s, 0) / allSpO2.length) : 0,
            vitality_score: day.vitality.length ? Math.round(day.vitality.reduce((sum, v) => sum + v, 0) / day.vitality.length) : 0,
            weight: day.weight.length ? day.weight[day.weight.length - 1] : 0
        });
    });

    appState.metricsAvailability = metricsCount;
    return {
        headers: ['date','steps','calories_burned','active_minutes','heart_rate_avg','heart_rate_resting','sleep_total_minutes','sleep_deep_minutes','sleep_rem_minutes','sleep_light_minutes','stress_score','spo2_avg','vitality_score','weight'],
        rows: processedRows
    };
}

function updateDashboard() {
    const data = appState.processedData;
    if (!data || data.length === 0) return;

    const metricsDiv = document.getElementById('metricsDisplay');
    const avgHR = Math.round(data.reduce((sum, row) => sum + row.heart_rate_avg, 0) / data.length);
    const avgSteps = Math.round(data.reduce((sum, row) => sum + row.steps, 0) / data.length);
    const avgSleep = Math.round(data.reduce((sum, row) => sum + row.sleep_total_minutes, 0) / data.length);
    const avgStress = Math.round(data.reduce((sum, row) => sum + row.stress_score, 0) / data.length);
    const avgSpO2 = Math.round(data.reduce((sum, row) => sum + row.spo2_avg, 0) / data.length);

    metricsDiv.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Frecuencia cardíaca</div>
                <div class="metric-value">${avgHR}</div>
                <div class="metric-availability">bpm promedio</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Pasos diarios</div>
                <div class="metric-value">${avgSteps.toLocaleString()}</div>
                <div class="metric-availability">promedio diario</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Sueño total</div>
                <div class="metric-value">${(avgSleep / 60).toFixed(1)}h</div>
                <div class="metric-availability">minutos promedio</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Estrés</div>
                <div class="metric-value">${avgStress}</div>
                <div class="metric-availability">puntuación media</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Saturación O₂</div>
                <div class="metric-value">${avgSpO2}%</div>
                <div class="metric-availability">promedio</div>
            </div>
        </div>
    `;
}

function updateQualityReport() {
    const data = appState.processedData;
    const metrics = appState.metricsAvailability;

    if (!data || data.length === 0) return;

    const qualityDiv = document.getElementById('qualityDisplay');
    const totalDays = data.length;

    let html = '<div class="metrics-grid">';
    html += `
        <div class="metric-card">
            <div class="metric-label">Días procesados</div>
            <div class="metric-value">${totalDays}</div>
            <div class="metric-availability">cobertura temporal</div>
        </div>
    `;

    html += `
        <div class="metric-card">
            <div class="metric-label">Métricas disponibles</div>
            <div class="metric-value">${Object.keys(metrics).length}</div>
            <div class="metric-availability">de 14 posibles</div>
        </div>
    `;
    html += '</div>';
    html += '<div class="card-subtitle" style="margin-top:16px;">Detalle por métrica</div>';
    html += '<div class="metrics-grid">';

    Object.entries(metrics).forEach(([key, count]) => {
        html += `
            <div class="metric-card">
                <div class="metric-label">${key.replace('_', ' ').toUpperCase()}</div>
                <div class="metric-value">${count}</div>
                <div class="metric-availability">${((count / totalDays) * 100).toFixed(1)}% cobertura</div>
            </div>
        `;
    });

    html += '</div>';
    qualityDiv.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('SmartLife Analyzer loaded');
});

async function startRetrain() {
    const statusDiv = document.getElementById('trainingStatus');
    if (!appState.dataLoaded || !appState.processedData || appState.processedData.length === 0) {
        statusDiv.innerHTML = '<div class="status-message status-error">Carga primero un CSV válido antes de entrenar.</div>';
        return;
    }

    if (typeof tf === 'undefined') {
        statusDiv.innerHTML = '<div class="status-message status-error">TensorFlow.js no está disponible en este entorno.</div>';
        return;
    }

    const target = document.getElementById('targetSelect').value;
    statusDiv.innerHTML = '<div class="status-message status-info">Preparando datos para entrenamiento...</div>';

    try {
        const { xs, ys, featureNames } = prepareDatasetForTraining(appState.processedData, target);
        const model = buildRegressionModel(featureNames.length);

        statusDiv.innerHTML = '<div class="status-message status-info">Entrenando modelo... revisa la consola para el progreso.</div>';

        await trainModel(model, xs, ys, (epoch, logs) => {
            statusDiv.innerHTML = `<div class="status-message status-info">Entrenando... epoch ${epoch} - loss: ${logs.loss.toFixed(4)}</div>`;
        });

        try {
            await model.save('indexeddb://smartlife-model-' + target);
            statusDiv.innerHTML = '<div class="status-message status-success">Entrenamiento completado y modelo guardado en IndexedDB.</div>';
        } catch (saveErr) {
            console.warn('No se pudo guardar en IndexedDB:', saveErr);
            statusDiv.innerHTML = '<div class="status-message status-warning">Entrenamiento completado, pero no se pudo guardar el modelo en IndexedDB.</div>';
        }

        xs.dispose();
        ys.dispose();
    } catch (err) {
        console.error('Error during retrain:', err);
        statusDiv.innerHTML = `<div class="status-message status-error">Error durante el entrenamiento: ${err.message}</div>`;
    }
}

function prepareDatasetForTraining(processedRows, target) {
    const featureNames = ['steps', 'calories_burned', 'active_minutes', 'heart_rate_avg', 'sleep_total_minutes', 'spo2_avg', 'vitality_score', 'weight'];
    const rows = processedRows.filter(row => row[target] != null && !Number.isNaN(row[target]));

    if (rows.length < 10) {
        throw new Error('No hay suficientes filas con el objetivo seleccionado para entrenar.');
    }

    const featureVals = [];
    const labelVals = [];

    rows.forEach(row => {
        const feats = featureNames.map(fn => Number(row[fn] || 0));
        if (feats.every(value => value === 0)) return;
        featureVals.push(feats);
        labelVals.push(Number(row[target] || 0));
    });

    const xs = tf.tensor2d(featureVals);
    const ys = tf.tensor2d(labelVals, [labelVals.length, 1]);

    const mins = xs.min(0);
    const maxs = xs.max(0);
    const range = maxs.sub(mins);
    const normalizedXs = xs.sub(mins).div(range.add(tf.scalar(1e-6)));

    const yMin = ys.min();
    const yMax = ys.max();
    const yRange = yMax.sub(yMin);
    const normalizedYs = ys.sub(yMin).div(yRange.add(tf.scalar(1e-6)));

    return {
        xs: normalizedXs,
        ys: normalizedYs,
        featureNames,
        normalizer: { mins, maxs, yMin, yMax }
    };
}

function buildRegressionModel(inputDim) {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [inputDim], units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'linear' }));
    model.compile({ optimizer: tf.train.adam(0.01), loss: 'meanSquaredError' });
    return model;
}

async function trainModel(model, xs, ys, onEpoch) {
    const batchSize = Math.min(32, Math.floor(xs.shape[0] / 2) || 1);
    return model.fit(xs, ys, {
        epochs: 50,
        batchSize,
        validationSplit: 0.15,
        shuffle: true,
        callbacks: {
            onEpochEnd: async (epoch, logs) => {
                if (onEpoch) onEpoch(epoch + 1, logs);
                await tf.nextFrame();
            }
        }
    });
}

function exportDataJSON() {
    const data = {
        exportDate: new Date().toISOString(),
        summary: {
            totalDays: appState.processedData.length
        },
        data: appState.processedData,
        metricsAvailability: appState.metricsAvailability
    };

    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'smartlife-export.json', 'application/json');
}

function exportDataCSV() {
    const headers = ['Date', 'Steps', 'Calories', 'HR Avg', 'Sleep (h)', 'Stress', 'SpO2', 'Vitality'];
    const rows = appState.processedData.map(row => [
        row.date,
        row.steps,
        row.calories_burned,
        row.heart_rate_avg,
        (row.sleep_total_minutes / 60).toFixed(1),
        row.stress_score,
        row.spo2_avg,
        row.vitality_score
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => typeof cell === 'string' ? `"${cell}"` : cell).join(',') + '\n';
    });

    downloadFile(csv, 'smartlife-export.csv', 'text/csv');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
