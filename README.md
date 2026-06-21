# SmartLife Analyzer

Aplicación web estática para explorar datos de salud exportados desde MiFitness y validar modelos de regresión sobre indicadores diarios.

## Qué incluye

- Carga y procesamiento local de archivos CSV.
- Dashboard con métricas diarias y calidad de datos.
- Análisis de tendencias, correlaciones y ritmos.
- Script de retraining con validación holdout y guardado del modelo en disco.

## Requisitos

- Navegador moderno para abrir `index.html`.
- Node.js 18+ para entrenar el modelo localmente.
- Un CSV exportado desde MiFitness con el formato esperado.

## Uso rápido

1. Abre `index.html` en el navegador, o sirve la carpeta con Live Server.
2. Ve a **Cargar Datos** y sube tu archivo CSV.
3. Revisa el Dashboard, Tendencias, Correlaciones y Calidad.

## Entrenamiento del modelo

El flujo recomendado para validar y guardar un modelo es el script de Node.js:

```powershell
npm install @tensorflow/tfjs-node
node retrain_model_node.js MiFitness_hlth_center_fitness_data.csv stress_score
```

El script genera:

- Modelo entrenado en `trained_models/`.
- Métricas de validación sobre holdout.
- Archivo de metadatos con el esquema de características y resultados.

Objetivos soportados:

- `stress_score`
- `vitality_score`
- `sleep_total_minutes`

## Estructura

- `index.html`: interfaz principal.
- `styles.css`: estilos complementarios.
- `app.js`: lógica de análisis local.
- `retrain_model_node.js`: entrenamiento y validación del modelo.
- `MiFitness_hlth_center_fitness_data.csv`: muestra de datos.

## Notas

- `trained_models/` y `node_modules/` están excluidos del repositorio.
- El proyecto está pensado para uso local o despliegue estático en GitHub Pages.
