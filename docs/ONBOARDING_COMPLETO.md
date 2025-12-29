# 🎓 ONBOARDING COMPLETO - GLOBAL TALENT CONNECTIONS

> **Bienvenido al equipo.** Esta guía te enseñará cómo funciona nuestro sistema de reclutamiento con IA, utilizando metáforas simples para entender la complejidad técnica.
> 
> **Tiempo estimado de lectura:** 30 minutos  
> **Nivel:** Principiante a Intermedio

---

## 📍 TABLA DE CONTENIDOS

1. [La Metáfora del Restaurante](#la-metáfora-del-restaurante)
2. [Las 3 Etapas del Sistema](#las-3-etapas-del-sistema)
3. [Tu Primer Día: Guía Práctica](#tu-primer-día-guía-práctica)
4. [Las Herramientas del Equipo](#las-herramientas-del-equipo)
5. [Preguntas Frecuentes](#preguntas-frecuentes)

---

## 🍽️ La Metáfora del Restaurante

Imagina que **Global Talent Connections es un restaurante de alta cocina automatizado:**

### 1. El Mozo 24/7 (Backend)
Nuestro servidor (`index.js`) es un mozo incansable que trabaja 24 horas.
*   **Escucha:** Está siempre parado en la puerta (Gmail) esperando clientes.
*   **Recibe:** Cuando llega un email (Cliente), toma su abrigo (CV).
*   **Filtra:** Si es solo publicidad, no lo deja pasar. Solo atiende a quienes traen CV.
*   **Organiza:** Anota todo en el libro de reservas (Firestore) sin que nadie se lo pida.

### 2. El Chef Ejecutivo (IA - Gemini)
*   **Clasifica:** Cuando el mozo le trae un CV, el Chef lo lee en 2 segundos y dice: *"Este es un Senior Developer, sabe React y Node.js. Le doy un 8.5/10"*.
*   **Cocina:** Más tarde, toma todos los ingredientes (Video entrevista + Notas + CV) y prepara el plato final: un **Informe DOCX** perfecto.

### 3. El Gerente (Tú / Frontend)
El Dashboard (`dashboard.html`) es tu oficina de control.
*   **Supervisa:** Ves la lista de espera que el mozo preparó.
*   **Decide:** Tienes el poder final. Con un botón dices **"Pasa a la mesa" (Aprobar)** o **"Lo sentimos, hoy no" (Rechazar)**.
*   **Coordina:** Si apruebas, el mozo automáticamente corre a servir la mesa (Agenda la entrevista y envía emails).

---

## 🗺️ Las 3 Etapas del Sistema

El flujo de vida de un candidato es lineal y simple:

### ETAPA 1: EXPLORAR (La Recepción)
*   **Estado:** Candidatos "crudos" que acaban de llegar por email.
*   **Tu trabajo:** Mirar el Score que puso la IA.
*   **Acción:**
    *   🟢 **APROBAR:** Pasa a la siguiente etapa.
    *   🔴 **RECHAZAR:** Se envía email de agradecimiento y va a la Papelera.

### ETAPA 2: GESTIÓN (La Mesa Principal)
*   **Estado:** Candidatos aprobados. Aquí ocurre la magia.
*   **Tu trabajo:**
    1.  Tener la entrevista (video).
    2.  Anotar tus impresiones.
    3.  Hacer clic en **"ANALIZAR CON IA"**.
*   **Acción del Sistema:** Genera el reporte DOCX y te da el enlace de descarga.
*   **Decisión Final:**
    *   🤝 **CONTRATAR:** ¡Éxito!
    *   ❌ **NO CALIFICA:** Se descarta con feedback profesional.

### ETAPA 3: PAPELERA (El Archivo)
*   **Estado:** Candidatos rechazados.
*   **Funcionalidad:** Nada se borra permanentemente por error.
*   **Backup:** Si te arrepientes, puedes darle a **"REACTIVAR"** (Control+Z) y el candidato vuelve a la etapa de Explorar como si nada hubiera pasado.

---

## 🚀 Tu Primer Día: Guía Práctica

Sigue estos 4 pasos para entender el sistema hoy mismo:

### Paso 1: Levantar el Restaurante
Abre tu terminal en la carpeta del proyecto y ejecuta:
npm install
npm start
Ahora abre tu navegador en: `http://localhost:3001`

### Paso 2: La Prueba de Fuego
Vamos a simular ser un candidato.
1.  Abre tu correo personal.
2.  Redacta un email para la dirección que configuraste en el sistema (`GMAIL_USER`).
3.  **Asunto:** "Postulación Desarrollador Frontend".
4.  **Adjunto:** Sube cualquier PDF que parezca un CV.
5.  **Enviar.**

### Paso 3: Ver la Magia
1.  Espera 2 minutos (el mozo revisa el correo cada 120 segundos).
2.  Mira la consola de tu terminal. Deberías ver: `📨 Correo recibido... Procesando CV...`.
3.  Refresca el Dashboard (`http://localhost:3001`).
4.  **¡Ahí está!** Tu candidato debería aparecer en la columna "Nuevos" con un Score asignado.

### Paso 4: Tomar el Control
1.  Haz clic en **"Aprobar"**. Verás cómo salta a la pestaña "Gestión".
2.  Haz clic en **"Analizar con IA"** (simulando que ya hubo entrevista).
3.  Espera unos segundos y descarga el DOCX generado. ¡Ábrelo y sorpréndete!

---

## 🛠️ Las Herramientas del Equipo

Para trabajar aquí, solo necesitas conocer esto:

*   **VS Code:** Donde escribimos el código.
*   **Firebase Console:** Donde vive la base de datos (Firestore). Si necesitas ver los datos "crudos", vas aquí.
*   **Google Cloud Storage:** Donde se guardan los archivos físicos (PDFs y DOCXs).
*   **Zoho Forms:** Usamos esto para que los candidatos llenen sus datos extra.

---

## ❓ Preguntas Frecuentes

**P: ¿Qué pasa si el PDF es una foto escaneada?**
R: No hay problema. Usamos Google Vision (OCR), que es como ponerle gafas de lectura al sistema. Lee texto incluso de imágenes.

**P: ¿El sistema envía emails solo?**
R: Sí. Cuando apruebas o rechazas, el sistema usa plantillas predefinidas para notificar al candidato. Tú no tienes que redactar nada manual.

**P: ¿Dónde cambio las preguntas de la entrevista?**
R: Eso está en el prompt de la IA dentro de `index.js`. Si quieres ajustar qué evalúa la IA, editas esa sección del código.

**P: ¡Borré un candidato sin querer!**
R: Ve a la pestaña "Papelera" en el Dashboard. Busca al candidato y dale al botón de restaurar.

---

**¡Bienvenido a bordo!**
Si tienes dudas técnicas profundas, lee el archivo `CONCEPTOS_FUNDAMENTALES.md`.
