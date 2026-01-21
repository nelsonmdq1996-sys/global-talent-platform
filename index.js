///////////////////////////////////////////////// Dependencias principales //////////////////////////////////////////////////////////
"use strict";
const child_process = require("child_process");
const { spawn } = require("child_process");
const { getStorage } = require("firebase-admin/storage");
const ROOT_PREFIX = "CV-clasificador/";
const express = require("express");
const multer = require("multer");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const pdfParse = require("pdf-parse");
const path = require("path");
const bodyParser = require("body-parser");
const stopword = require("stopword");
const stopwordsEs = require("stopwords-es");
const stopwordsEn = require("stopwords-en");
const natural = require("natural");
const cors = require("cors");
const os = require("os");
const fs = require("fs");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
require("dotenv").config();
const fichaGenerator = require("./services/fichaGenerator");
const { 
  buscarArchivoEnWorkDrive, 
  buscarVideoEnWorkDrive,
  descargarArchivoDeWorkDrive 
} = require('./zohoWorkDrive');


// ========================================================================
// 📧 CONFIGURACIÓN DE NODEMAILER (PARA ENVÍO DE EMAILS CON HTML)
// ========================================================================
const transporter = nodemailer.createTransport({
    service: 'gmail', // Usar servicio de Gmail
    auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASS
    }
});

// Verificar configuración del transporter (solo al iniciar, no bloquea)
transporter.verify(function (error, success) {
    if (error) {
        console.log("⚠️ Error en configuración de email:", error.message);
        console.log("   El sistema seguirá funcionando, pero los emails pueden fallar.");
    } else {
        console.log("✅ Servidor de email listo para enviar mensajes");
    }
});
const axios = require("axios");
const vision = require("@google-cloud/vision");
const crypto = require("node:crypto");
const { Storage } = require("@google-cloud/storage");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");

// Configurar ffmpeg para usar el binario estático
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
  console.log(`✅ FFmpeg configurado: ${ffmpegStatic}`);
} else {
  console.warn(`⚠️ ffmpeg-static no encontrado, usando ffmpeg del sistema`);
}
const pLimit = require("p-limit");        // concurrencia
const helmet = require("helmet");         // seguridad
const rateLimit = require("express-rate-limit");
const verifyToken = require("./authMiddleware");
const mammoth = require("mammoth");
const { v4: uuidv4 } = require("uuid");
const tempBase = path.join(os.tmpdir(), "cvs-en-proceso");


// === Gemini AI ===
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// === INICIALIZACIÓN DE APP ===
const app = express();
app.use(cors());
app.use(express.json());
// ==========================================
// ⚙️ CONFIGURACIÓN DE ENTORNO (MASTER SWITCH)
// ==========================================
// Poner "CVs_staging" para pruebas limpias.
// Poner "CVs_aprobados" cuando quieras volver a ver los 73 candidatos reales.
const MAIN_COLLECTION = "CVs_staging"; 

console.log(`🚀 SISTEMA INICIADO EN MODO: ${MAIN_COLLECTION}`);

// 🔥 CRÍTICO: ESTO PERMITE QUE EL FRONTEND VEA EL LOGO.PNG
app.use(express.static(__dirname)); 


const DBG_PREVIEW = 500;
////////////////////////////////////////////////////////////////////// CONFIGURACIÓN GLOBAL ///////////////////////////////////////////

const SIM_MIN = Number(process.env.SIM_MIN || 0.15);
const CLASIF_ROOT = "CV-clasificador";

const EMBEDDING_MODEL_BULK =
  process.env.EMBEDDING_MODEL_BULK || "text-embedding-3-small";
const EMBEDDING_MAX_CHARS = 8000;

const RANK_EMBEDDING_WEIGHT = (() => {
  const v = Number(process.env.RANK_EMBEDDING_WEIGHT);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.75;
})();

const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_SEED = 7;
const AI_SCORE_VERSION = 5;

const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const L = pLimit(CONCURRENCY);

// OpenAI dependencies removed. Keeping Gemini configuration only.

//////////////////////////////////////////////////////////////////// MANEJO DE GMAIL – IMAP + MAILPARSER //////////////////////////////

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const FormData = require("form-data");

//////////////////////////////////////////////////////////////////// CONFIGURACIÓN FIREBASE + GOOGLE STORAGE ///////////////////////////////

const FIREBASE_CREDS = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
};

const PROJECT_ID = FIREBASE_CREDS.projectId;

const EXPLICIT_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || null;

const BUCKET_CANDIDATES = [
  EXPLICIT_BUCKET,
  PROJECT_ID ? `${PROJECT_ID}.firebasestorage.app` : null,
  PROJECT_ID ? `${PROJECT_ID}.appspot.com` : null,
].filter(Boolean);

const GCS_LOCATION = process.env.GCS_BUCKET_LOCATION || "US";
const AUTO_CREATE_BUCKET =
  String(process.env.AUTO_CREATE_BUCKET || "false").toLowerCase() === "true";

const visionClient = new vision.ImageAnnotatorClient({
  credentials: {
    client_email: FIREBASE_CREDS.clientEmail,
    private_key: FIREBASE_CREDS.privateKey,
  },
  projectId: PROJECT_ID,
});

const admin = require("firebase-admin");
let firestore;
let bucket;
let STORAGE_READY = false;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

///////////////////////////////////////////////////express app /////////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3001;

app.use(cors());

// Configuración de Seguridad (Helmet) Corregida
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "img-src": ["'self'", "data:", "https://*"],
        "connect-src": [
            "'self'", 
            "http://localhost:3001", 
            "https://cv-cladificador-eyvb.onrender.com", 
            "https://cv-cladificador.onrender.com",
            "https://unpkg.com",
            "https://generativelanguage.googleapis.com",
            "https://www.gstatic.com",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com"
        ],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://www.gstatic.com"],
      },
    },
  })
);

app.use(bodyParser.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
// rutas protegidas
app.use([
  "/cv-original-url/:filename",
  "/cv-censurado-url/:filename",
  "/agendar-cita",
  "/contratar",
  "/descartar",
  "/analyze",
  "/cv-censurado-url"
], verifyToken);


///////////////////////////////////////////////////////// HELPERS //////////////////////////////////////////////////////////////////////////////////////////
async function extractTextSmartFromPdfFile(pdfPath, opts = {}) {
  const thresholdChars = opts.thresholdChars ?? 120; // sube umbral para evitar OCR innecesario
  const buf = fs.readFileSync(pdfPath);

  try {
    const perPage = [];
    const render_page = (pageData) =>
      pageData.getTextContent().then((tc) => {
        const txt = tc.items.map((i) => i.str).join(" ").trim();
        perPage.push(txt);
        return txt;
      });
    const parsed = await pdfParse(buf, { pagerender: render_page });
    const textDigital = (parsed.text || "").trim();
    if (textDigital.length >= thresholdChars) {
      // Heurística: si al menos 50% de las páginas tienen >40 chars, nos quedamos con el texto digital
      const density = perPage.filter(t => (t || "").length > 40).length / Math.max(1, perPage.length);
      if (density >= 0.5) return perPage.length ? perPage.join("\\n\\n") : textDigital;
    }
  } catch (e) {
    console.warn("pdf-parse falló, intentaré Vision OCR (async GCS):", e.message);
  }

  if (!STORAGE_READY || !bucket?.name) {
    console.warn("Vision OCR omitido: Storage no listo.");
    return "";
  }
  try {
    const inPrefix = `vision_ocr/in/`;
    const outPrefix = `vision_ocr/out/${Date.now()}_${path.basename(pdfPath).replace(/\\s+/g, "_")}/`;
    const gcsInPath = `${inPrefix}${crypto.randomUUID()}.pdf`;
    await bucket.upload(pdfPath, { destination: gcsInPath, metadata: { contentType: "application/pdf" } });

    const inputGcsUri = `gs://${bucket.name}/${gcsInPath}`;
    const outputGcsUri = `gs://${bucket.name}/${outPrefix}`;

    const request = {
      requests: [{
        inputConfig: { gcsSource: { uri: inputGcsUri }, mimeType: "application/pdf" },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: { gcsDestination: { uri: outputGcsUri }, batchSize: 10 },
      }],
    };

    const [operation] = await visionClient.asyncBatchAnnotateFiles(request);
    await operation.promise();

    const [files] = await bucket.getFiles({ prefix: outPrefix });
    let full = "";
    for (const f of files) {
      const [contents] = await f.download();
      const json = JSON.parse(contents.toString("utf8"));
      const responses = json.responses || [];
      for (const r of responses) full += (r.fullTextAnnotation?.text || "") + "\\n";
    }

    try { await bucket.file(gcsInPath).delete({ ignoreNotFound: true }); } catch { }
    for (const f of files || []) { try { await f.delete({ ignoreNotFound: true }); } catch { } }

    return full.trim();
  } catch (e) {
    console.error("❌ Vision OCR (async) error:", e);
    return "";
  }
}

/////////////// sanitizar /////////////

function sanitizeForAI(text) {
  return text.replace(/[{}`<>]/g, " ");
}

/////////////////// obtiene candidatos  a no mostrar ///////////////////////
async function obtenerCandidatosBloqueados() {
  // 🔧 CORREGIDO: Solo bloquear candidatos en 'trash', NO en 'stage_3' (Informes)
  // stage_3 es la etapa de "Generar Informe", no son contratados, deben aparecer
  const bloqueados = new Set();
  
  try {
    const snap = await firestore.collection(MAIN_COLLECTION)
      .where("stage", "==", "trash")
      .get();
    
    snap.forEach((doc) => {
      bloqueados.add(doc.id.trim().toLowerCase());
    });
  } catch (error) {
    console.warn("Error obteniendo candidatos bloqueados:", error);
  }

  return bloqueados;
}

///////////////////// Normaliza cadenas (minúsculas, sin tildes) ////////////////////

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Helper normStr (igual que normalize, formato arrow)
const normStr = (str) =>
  String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

///////////////////// Normaliza texto de ofertas para embeddings. ////////////////////

function canonicalOfferText(txt) {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ... resto de helpers intactos ...

//////////////////////// createEmbedding /////////////////

// OpenAI Embedding is DISABLED.
// Now just return empty array and message.
async function createEmbedding(text) {
  console.log("🔕 Embeddings deshabilitados: createEmbedding() retorna [].");
  return [];
}

//////////////////////// organizarCVconIA (usando Gemini) /////////////////

async function organizarCVconIA({ textoPlano, nombreArchivo, email, puesto }) {
  const prompt = `
Eres un asistente experto encargado de convertir un CV parseado desde un correo electrónico estándar
en un JSON corporativo con el FORMATO EXACTO solicitado por Global Talent Connections.

⚠ INSTRUCCIONES IMPORTANTES:
- El texto que recibes ya suele estar en formato JSON parcialmente estructurado.
- SI UN CAMPO YA TIENE VALOR, RESPÉTALO. No lo cambies.
- Solo completa campos vacíos o claramente faltantes.
- Si algún dato NO aparece en el texto, deja el campo vacío.
- No inventes información.
- Conserva EXACTAMENTE la misma estructura JSON.
- Respeta pluralidad: educación y experiencia pueden tener varias entradas.

==========================
CV PLANO / JSON PARSEADO
==========================
${textoPlano}

Devuélveme ÚNICAMENTE un JSON válido con esta estructura EXACTA:

{
  "datos_personales": {
    "nombre_completo": "",
    "nacionalidad": "",
    "fecha_nacimiento": "",
    "estado_civil": "",
    "genero": "",
    "tipo_documento": "",
    "numero_documento": "",
    "discapacidad": ""
  },
  "contacto": {
    "telefono_principal": "",
    "telefono_secundario": "",
    "email": ""
  },
  "educacion": [
    {
      "titulo": "",
      "institucion": "",
      "pais": "",
      "area_estudio": "",
      "tipo_estudio": "",
      "estado": ""
    }
  ],
  "experiencia": [
    {
      "empresa": "",
      "rol": "",
      "nivel_experiencia": "",
      "rubro": "",
      "fecha_inicio": "",
      "fecha_fin": "",
      "pais": "",
      "personas_a_cargo": "",
      "responsabilidades": [],
      "manejo_presupuesto": "",
      "referencia": {
        "nombre": "",
        "email": ""
      },
      "salario": {
        "moneda": "",
        "monto": ""
      },
      "modalidad": ""
    }
  ],
  "habilidades": {
    "autogestion_organizacion": "",
    "comunicacion_efectiva": "",
    "adaptacion_cambio": "",
    "motivacion": ""
  },
  "idiomas": [
    {
      "idioma": "",
      "nivel_escrito": "",
      "nivel_oral": ""
    }
  ],
  "seleccion_I": {
    "desfase_horario": "",
    "herramientas_remoto": "",
    "especialidad_postula": ""
  },
  "seleccion_II": {
    "priorizacion": "",
    "autonomia": "",
    "claridad_mensajes": "",
    "comunicacion_frecuencia": "",
    "manejo_falla": "",
    "interes_remoto": "",
    "balance_trabajo_vida": "",
    "disponible_actualmente": ""
  },
  "puesto": "",
  "nombre_archivo": "",
  "applicant_email": ""
}
`;

  try {
    // Gemini expects an array of contents (no roles required)
    const result = await model.generateContent(prompt);
    let raw = result?.response?.text() || "{}";
    // Quita marcas de código y posibles rodeos del modelo
    raw = raw.trim()
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/i, "")
      .replace(/^\s*[\r\n]+/, "")
      .replace(/[\r\n]+```$/, "");
    const json = JSON.parse(raw);

    json.puesto = puesto || json.puesto || "";
    json.nombre_archivo = nombreArchivo || json.nombre_archivo || "";
    json.applicant_email = email || json.applicant_email || "";

    if (json.contacto && !json.contacto.email && json.applicant_email) {
      json.contacto.email = json.applicant_email;
    }
    return json;
  } catch (e) {
    console.error("⚠️ Error en organizarCVconIA (Gemini):", e.message);
    return {};
  }
}


//////////////////////// extraerNombreYEmailDelCV (usando Gemini) /////////////////

async function extraerNombreYEmailDelCV(textoCV) {
  const prompt = `
Eres un asistente experto en análisis de CVs. Tu tarea es extraer ÚNICAMENTE el nombre completo y el email del candidato del siguiente texto de CV.

INSTRUCCIONES:
- Extrae el NOMBRE COMPLETO del candidato (generalmente aparece al inicio del CV o en la sección de datos personales).
- Extrae el EMAIL del candidato (busca patrones como nombre@dominio.com).
- Si no encuentras alguno de estos datos, devuelve una cadena vacía "" para ese campo.
- NO inventes información. Solo usa lo que está explícitamente en el texto.
- Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "nombre": "",
  "email": ""
}

==========================
TEXTO DEL CV:
==========================
${textoCV.slice(0, 5000)}
`;

  try {
    const result = await model.generateContent(prompt);
    let raw = result?.response?.text() || "{}";
    // Limpiar posibles marcas de código
    raw = raw.trim()
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/i, "")
      .replace(/^\s*[\r\n]+/, "")
      .replace(/[\r\n]+```$/, "");
    const json = JSON.parse(raw);
    
    // Validar que sean strings y limpiar
    const nombre = (json.nombre || "").trim();
    const email = (json.email || "").trim().toLowerCase();
    
    // Validación básica de email
    const emailValido = email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ? email : "";
    
    return {
      nombre: nombre || "",
      email: emailValido || ""
    };
  } catch (e) {
    console.error("⚠️ Error en extraerNombreYEmailDelCV (Gemini):", e.message);
    // Fallback: intentar extraer email con regex básico
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    const emailsEncontrados = textoCV.match(emailRegex) || [];
    const emailFallback = emailsEncontrados.length > 0 ? emailsEncontrados[0].toLowerCase() : "";
    
    return {
      nombre: "",
      email: emailFallback
    };
  }
}

//////////////////////// organizar informacion para almacenar /////////////////



// Escapa texto para usarlo en RegExp de forma segura
// Escapa texto para usarlo en RegExp de forma segura
function escapeRegExp(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Helper para extracción simple: "Campo: valor"
// Soporta: "Campo:", "Campo 1:", "Campo 2:", etc.
function pick(text, field) {
  if (!text) return "";
  const pattern = new RegExp(
    escapeRegExp(field) + "\\s*\\d*\\s*:\\s*([^;\\n]+)",
    "i"
  );
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
}

// --- Helper MULTILÍNEA para preguntas tipo encuesta
// Soporta:
//  - "¿Pregunta ... ?\nRespuesta"
//  - "Pregunta: Respuesta"
//  - "Pregunta\nRespuesta"
function pickMultiline(section, question) {
  if (!section) return "";

  // Caso principal: "¿Pregunta ... ?\nRespuesta"
  const pattern = new RegExp(
    escapeRegExp(question) + ".*?\\?\\s*\\n\\s*([^\\n]+)",
    "i"
  );
  const m = section.match(pattern);
  if (m) return m[1].trim();

  // Fallback A: "Pregunta: respuesta"
  const rxInline = new RegExp(
    escapeRegExp(question) + "\\s*:\\s*([^\\n]+)",
    "i"
  );
  const m1 = section.match(rxInline);
  if (m1) return m1[1].trim();

  // Fallback B:
  // Pregunta
  // Respuesta
  const rxMulti = new RegExp(
    escapeRegExp(question) + "\\s*\\n\\s*([^\\n]+)",
    "i"
  );
  const m2 = section.match(rxMulti);
  if (m2) return m2[1].trim();

  return "";
}

// --- Helper para bloques múltiples: Educación, Experiencia, etc.
// Detecta "Titulo:", "Titulo 1:", "Empresa:", "Empresa 2:", etc.
function splitBlocks(section, keywordBase) {
  if (!section) return [];

  const rx = new RegExp(
    escapeRegExp(keywordBase) + "\\s*\\d*\\s*:",
    "ig"
  );

  const matches = [...section.matchAll(rx)];
  if (matches.length === 0) return [];

  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : section.length;
    const block = section.slice(start, end).trim();
    if (block) blocks.push(block);
  }

  return blocks;
}



// --- Decode básico
function decodeHtmlEntities(text = "") {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}


// ============================================================================================
// =============================  PARSER PRINCIPAL  ===========================================
// ============================================================================================
const { convert: htmlToText } = require("html-to-text");
function parsearCorreoEstandar(raw) {
  if (!raw) return { textoPlano: "", jsonParcial: {} };

  let body = htmlToText(raw, {
    preserveNewlines: true,
    wordwrap: false,
  });

  body = decodeHtmlEntities(body)
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  // Secciones 1), 2), 3)...
  const sections = body.split(/\n(?=\d+\)\s+)/g);

  const result = {
    datos_personales: {
      nombre_completo: "",
      nacionalidad: "",
      fecha_nacimiento: "",
      estado_civil: "",
      genero: "",
      tipo_documento: "",
      numero_documento: "",
      discapacidad: ""
    },
    contacto: {
      telefono_principal: "",
      telefono_secundario: "",
      email: ""
    },
    educacion: [],
    experiencia: [],
    habilidades: {
      autogestion_organizacion: "",
      comunicacion_efectiva: "",
      adaptacion_cambio: "",
      motivacion: ""
    },
    seleccion_I: {
      desfase_horario: "",
      herramientas_remoto: "",
      especialidad_postula: ""
    },
    seleccion_II: {
      priorizacion: "",
      autonomia: "",
      claridad_mensajes: "",
      comunicacion_frecuencia: "",
      manejo_falla: "",
      interes_remoto: "",
      balance_trabajo_vida: "",
      disponible_actualmente: ""
    },
    idiomas: [],
    puesto: "",
    nombre_archivo: "",
    applicant_email: ""
  };

  // ===== 1) DATOS PERSONALES =====
  const sec1 = sections.find(s => /^1\)/.test(s)) || "";
  result.datos_personales = {
    nombre_completo: pick(sec1, "Nombre completo"),
    nacionalidad: pick(sec1, "Nacionalidad"),
    fecha_nacimiento: pick(sec1, "Fecha de nacimiento"),
    estado_civil: pick(sec1, "Estado civil"),
    genero: pick(sec1, "Género"),
    tipo_documento: pick(sec1, "Tipo de documento"),
    numero_documento: pick(sec1, "Número de documento"),
    discapacidad: pick(sec1, "Discapacidad"),
  };

  // ===== 2) CONTACTO =====
  const sec2 = sections.find(s => /^2\)/.test(s)) || "";
  let correo = pick(sec2, "Email") || "";
  // Limpia punto final y espacios
  correo = correo.replace(/\.*\s*$/, "");

  result.contacto = {
    telefono_principal: pick(sec2, "Teléfono principal"),
    telefono_secundario: pick(sec2, "Teléfono secundario"),
    email: correo,
  };

  // ===== 3) EDUCACIÓN + IDIOMAS =====
  const sec3 = sections.find(s => /^3\)/.test(s)) || "";
  const eduBlocks = splitBlocks(sec3, "Titulo");

  result.educacion = eduBlocks.map(b => ({
    titulo: pick(b, "Titulo"),
    institucion: pick(b, "Institución"),
    pais: pick(b, "País de estudios"),
    area_estudio: pick(b, "Área"),
    tipo_estudio: pick(b, "Tipo de estudios"),
    estado: pick(b, "Estado"),
  }));

  // Idiomas en una sola línea
  const idiomasStr = pick(sec3, "Idiomas");
  if (idiomasStr) {
    result.idiomas = idiomasStr
      .split(/[,;]+/)
      .map(i => i.trim())
      .filter(Boolean)
      .map(i => ({
        idioma: i,
        nivel_escrito: "",
        nivel_oral: ""
      }));
  }

  // Niveles de inglés separados
  const nivelInglesOral = pick(sec3, "Nivel de ingles (oral)");
  const nivelInglesEscrito = pick(sec3, "Nivel de ingles (escrito)");
  if (nivelInglesOral || nivelInglesEscrito) {
    if (!Array.isArray(result.idiomas)) result.idiomas = [];
    result.idiomas.push({
      idioma: "Inglés",
      nivel_escrito: nivelInglesEscrito || "",
      nivel_oral: nivelInglesOral || ""
    });
  }

  // ===== 4) EXPERIENCIA =====
  const sec4 = sections.find(s => /^4\)/.test(s)) || "";
  const expBlocks = splitBlocks(sec4, "Empresa");

  result.experiencia = expBlocks.map(b => {
    let paisEmpresa = pick(b, "País");
    // Limpia contaminación tipo "País: españa  Personas a cargo: No"
    if (paisEmpresa) {
      paisEmpresa = paisEmpresa.replace(/Personas a cargo:.*/i, "").trim();
    }

    const salarioRaw = pick(b, "Salario") || "";
    const monedaMatch = typeof salarioRaw === "string" ? salarioRaw.match(/[A-Za-z]+/) : null;
    const montoMatch = typeof salarioRaw === "string" ? salarioRaw.match(/[\d.,]+/) : null;

    return {
      empresa: pick(b, "Empresa"),
      rol: pick(b, "Rol"),
      nivel_experiencia: pick(b, "Nivel de experiencia"),
      rubro: pick(b, "Rubro"),
      fecha_inicio: pick(b, "Fecha de inicio"),
      fecha_fin: pick(b, "Fecha de finalización"),
      pais: paisEmpresa || "",
      personas_a_cargo: pick(b, "Personas a cargo"),
      responsabilidades: (pick(b, "Responsabilidades") || "")
        .split(/[;,]/)
        .map(r => r.trim())
        .filter(Boolean),
      manejo_presupuesto: pick(b, "Manejo de presupuesto"),
      referencia: {
        nombre: pick(b, "Referencia nombre"),
        email: pick(b, "Referencia email"),
      },
      salario: {
        moneda: monedaMatch ? monedaMatch[0] : "",
        monto: montoMatch ? montoMatch[0] : "",
      },
      modalidad: pick(b, "Modalidad"),
    };
  });

  // ===== 5) HABILIDADES =====
  const sec5 = sections.find(s => /^5\)/.test(s)) || "";
  result.habilidades = {
    autogestion_organizacion: pick(sec5, "Autogestión y Organización"),
    comunicacion_efectiva: pick(sec5, "Comunicación efectiva"),
    adaptacion_cambio: pick(sec5, "Adaptación al cambio"),
    motivacion: pick(sec5, "Motivación"),
  };

  // ===== 6) SELECCIÓN I (multilínea) =====
  const sec6 = sections.find(s => /^6\)/.test(s)) || "";
  result.seleccion_I = {
    desfase_horario: pickMultiline(sec6, "¿Estas dispuesto"),
    herramientas_remoto: pickMultiline(sec6, "¿Cuenta con el espacio"),
    especialidad_postula: pickMultiline(sec6, "Especialidad a la que postula"),
  };

  // ===== 7) SELECCIÓN II (multilínea) =====
  const sec7 = sections.find(s => /^7\)/.test(s)) || "";
  result.seleccion_II = {
    priorizacion: pickMultiline(sec7, "¿Cómo priorizas"),
    autonomia: pickMultiline(sec7, "Nivel de autonomía"),
    claridad_mensajes: pickMultiline(sec7, "¿Cómo garantizas"),
    comunicacion_frecuencia: pickMultiline(sec7, "¿Con que frecuencia"),
    manejo_falla: pickMultiline(sec7, "¿Qué haces cuando falla"),
    interes_remoto: pickMultiline(sec7, "¿Qué es lo que más te atrae"),
    balance_trabajo_vida: pickMultiline(sec7, "¿Cómo equilibras"),
    disponible_actualmente: pickMultiline(sec7, "¿Esta disponible"),
  };

  const textoPlano = JSON.stringify(result, null, 2);

  return { textoPlano, jsonParcial: result };
}

// ========================================================================
// 📩 ANALIZADOR DE CORREOS (VERSIÓN FINAL OPTIMIZADA)
// ========================================================================
async function analizarCorreos() {
  let client;
  try {
    // 1. CONEXIÓN IMAP
    client = new ImapFlow({
      host: process.env.IMAP_HOST,
      port: parseInt(process.env.IMAP_PORT || "993"),
      secure: true,
      auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASS },
      keepAlive: { interval: 30000, idleInterval: 60000, forceNoop: true }
    });

    client.on("error", (err) => console.error("⚠️ Error IMAP:", err.message));
    await client.connect();
    await client.mailboxOpen("INBOX");
    console.log("📬 INBOX abierto - Buscando CVs...");

    // 2. GESTIÓN DE CONTROL (Evitar repetidos)
    const COLECCION_CONTROL = "emails_procesados_reintento_v2";
    let lastUID = 0;
    const snapshotLast = await firestore.collection(COLECCION_CONTROL).orderBy("uid", "desc").limit(1).get();
    if (!snapshotLast.empty) lastUID = parseInt(snapshotLast.docs[0].data().uid, 10);

    // 3. BUCLE DE LECTURA
    for await (const msg of client.fetch(`${lastUID + 1}:*`, { envelope: true, source: true, uid: true })) {
      const uid = msg.uid;
      const subject = msg.envelope.subject || "";
      
      // Filtro rápido
      if (!/^Postulación/i.test(subject) && !/^Video-CV/i.test(subject)) continue;

      const processedRef = firestore.collection(COLECCION_CONTROL).doc(String(uid));
      if ((await processedRef.get()).exists) continue;

      console.log(`🔎 Procesando correo: ${subject}`);

      // 4. PARSEO DEL CORREO
      const parsed = await simpleParser(msg.source);
      const bodyContent = parsed.text || parsed.html || "";

      // 🔥 ID MATCHING ROBUSTO (Regex busca cualquier email en el cuerpo)
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
      const todosLosEmails = bodyContent.match(emailRegex) || [];
      // Excluye tus propios correos de sistema
      const candidatoEmail = todosLosEmails.find(e => !e.includes("globaltalent") && !e.includes("zohocreator") && !e.includes("admin"));

      if (!candidatoEmail) {
        console.log("⚠️ No se detectó email de candidato. Saltando.");
        await processedRef.set({ uid, status: "skipped_no_email", fecha: admin.firestore.FieldValue.serverTimestamp() });
        continue;
      }

      // Generar ID idéntico al Webhook
      const safeId = candidatoEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
      console.log(`🎯 Match ID: ${safeId}`);

      // 5. BUSCAR PDF ADJUNTO
      const pdfAttachment = parsed.attachments.find(a => a.contentType === "application/pdf" || a.filename.toLowerCase().endsWith(".pdf"));
      
      if (!pdfAttachment) {
        console.log("⚠️ Sin PDF adjunto.");
        await processedRef.set({ uid, status: "skipped_no_pdf", fecha: admin.firestore.FieldValue.serverTimestamp() });
        continue;
      }

      // 6. BUSCAR VIDEO ADJUNTO (si existe)
      const videoAttachment = parsed.attachments.find(a => {
        const contentType = (a.contentType || "").toLowerCase();
        const filename = (a.filename || "").toLowerCase();
        return contentType.startsWith("video/") || 
               filename.endsWith(".mp4") || 
               filename.endsWith(".mov") || 
               filename.endsWith(".avi") || 
               filename.endsWith(".mkv") ||
               filename.endsWith(".webm");
      });
      
      let videoUrl = null;
      if (videoAttachment) {
        console.log(`🎥 Video encontrado: ${videoAttachment.filename} (${(videoAttachment.size / 1024 / 1024).toFixed(2)} MB)`);
        try {
          // Subir video a Storage
          const videoExtension = videoAttachment.filename.split('.').pop() || 'mp4';
          const videoFileName = `CVs_staging/videos/${safeId}_video.${videoExtension}`;
          const videoBucketFile = bucket.file(videoFileName);
          
          await videoBucketFile.save(videoAttachment.content, { 
            metadata: { 
              contentType: videoAttachment.contentType || "video/mp4" 
            } 
          });
          
          // Generar link firmado (válido por mucho tiempo) - Configurado para abrir inline (no descargar)
          const [signedVideoUrl] = await videoBucketFile.getSignedUrl({ 
            action: 'read', 
            expires: '01-01-2035',
            responseDisposition: 'inline' // 👈 Esto hace que se abra en el navegador en vez de descargar
          });
          
          videoUrl = signedVideoUrl;
          console.log(`✅ Video subido correctamente: ${videoFileName}`);
        } catch (error) {
          console.error("❌ Error subiendo video:", error.message);
          // No bloqueamos el proceso si falla el video
        }
      }

      // 7. SUBIR PDF A STORAGE (Arregla el Link)
      const bucketFile = bucket.file(`CVs_staging/files/${safeId}_CV.pdf`);
      await bucketFile.save(pdfAttachment.content, { metadata: { contentType: "application/pdf" } });
      const [publicCvUrl] = await bucketFile.getSignedUrl({ action: 'read', expires: '01-01-2035' });
      console.log("📤 Link CV generado correctamente.");

      // 8. RECUPERAR DATOS DEL WEBHOOK
      const docRef = firestore.collection("CVs_staging").doc(safeId);
      const docSnap = await docRef.get();
      
      let datosZoho = { respuestas_filtro: {} };
      if (docSnap.exists) datosZoho = docSnap.data();
      else {
          // Fallback por si el mail llega antes que el webhook
          await docRef.set({ 
              id: safeId, 
              email: candidatoEmail, 
              nombre: "Candidato (Mail)", 
              origen: "mail_first",
              historial_movimientos: [
                  {
                      date: new Date().toISOString(),
                      event: 'Ingreso por Zoho',
                      detail: 'Candidato recibido desde formulario web (email llegó antes que webhook)',
                      usuario: 'Sistema (Email)'
                  }
              ]
          }, { merge: true });
      }

      // 9. LEER TEXTO DEL PDF (CRÍTICO: Aquí leemos el CV real)
      let pdfText = "";
      try {
          const pdfData = await pdfParse(pdfAttachment.content);
          pdfText = pdfData.text.slice(0, 20000); // Leemos hasta 20k caracteres
      } catch (e) { console.error("Error leyendo PDF:", e.message); }

      // 10. GENERAR RESEÑAS (CV y Video si existe)
      console.log("📝 Generando reseña del CV...");
      const reseñaCV = await generarResenaCV(pdfText, datosZoho.puesto || "General");
      
      // 🎥 NUEVA LÓGICA: Video se procesa en background (NO bloquea)
      const videoUrlParaAnalizar = videoUrl || datosZoho.video_url;
      let videoStatus = "none";
      
      if (videoUrlParaAnalizar) {
        const origenVideo = videoUrl ? "adjunto en email (subido a Storage)" : "link del webhook";
        console.log(`🎥 Video detectado (${origenVideo}). Se procesará en background...`);
        videoStatus = "pending";
        
        // Disparar procesamiento en background (NO bloquea el ciclo IMAP)
        procesarVideoEnBackground(safeId, videoUrlParaAnalizar, datosZoho.puesto || "General")
          .catch(error => {
            console.error(`❌ Error procesando video en background para ${safeId}:`, error.message);
          });
      }

      // 11. IA CALIBRADA (Cruce de Datos: Formulario + CV) - SIN VIDEO por ahora
      console.log("🤖 Calibrando Score (Formulario + CV)...");
      
      // Preparar datos del formulario para el análisis
      const datosFormulario = JSON.stringify(datosZoho.respuestas_filtro || "Vacio");
      
      // Llamar a la función mejorada que acepta reseñas (solo CV por ahora)
      let analisisIA = { score: 50, motivos: "Pendiente", alertas: [] };
      try {
          analisisIA = await verificaConocimientosMinimos(
            datosZoho.puesto || "General",
            datosFormulario, // Respuestas del formulario
            "", // declaraciones (vacío por ahora)
            reseñaCV, // Reseña del CV
            null // Reseña del video (null porque se procesa en background)
          );
          
          // Limitar score cuando NO hay video procesado aún (máximo 75)
          if (videoStatus === "pending") {
              analisisIA.score = Math.min(analisisIA.score, 75);
              if (!Array.isArray(analisisIA.alertas)) {
                analisisIA.alertas = [];
              }
              analisisIA.alertas.push("Video pendiente de análisis");
          } else {
              // Si NO hay video, límite de 75
              analisisIA.score = Math.min(analisisIA.score, 75);
          }
      } catch (e) { 
          console.error("Error IA:", e.message);
          // Si falla el análisis, mantener las reseñas generadas
      }

      // 12. ACTUALIZAR BASE DE DATOS (Master Update)
      // Usamos .set con { merge: true } para asegurarnos de crear el 'stage' si no existe
      const updateData = {
        cv_url: publicCvUrl,
        tiene_pdf: true,
        ia_score: analisisIA.score,
        ia_motivos: analisisIA.motivos,
        ia_alertas: analisisIA.alertas || [],
        ia_status: "processed",
        
        // 🔥 ESTO ES LO QUE FALTABA: La etiqueta para el Frontend
        stage: datosZoho.stage || 'stage_1', 
        status_interno: datosZoho.status_interno || 'new',
        
        // Reseñas generadas por IA
        reseña_cv: reseñaCV,
        reseña_video: null, // Se actualizará cuando termine el procesamiento del video
        video_status: videoStatus, // "pending", "none", o "completed" (se actualiza después)
        video_error: null, // Se actualizará si hay error en el procesamiento
        
        actualizado_en: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Si encontramos un video adjunto, actualizamos el video_url
      // Solo si no existe ya un video_url del webhook (el link pegado tiene prioridad)
      if (videoUrl && !datosZoho.video_url) {
        updateData.video_url = videoUrl;
        updateData.video_tipo = "archivo";
        console.log(`✅ Video URL actualizado desde email: ${videoUrl.substring(0, 50)}...`);
      } else if (videoUrl && datosZoho.video_url) {
        // Si ya había un video_url del webhook (link pegado), lo mantenemos y guardamos
        updateData.video_url = datosZoho.video_url;
        updateData.video_tipo = datosZoho.video_tipo || "link";
        console.log(`ℹ️ Video URL ya existe desde webhook, manteniendo: ${datosZoho.video_url.substring(0, 50)}...`);
      } else if (datosZoho.video_url && !videoUrl) {
        // Si el video viene del webhook pero no del email, guardarlo también
        updateData.video_url = datosZoho.video_url;
        updateData.video_tipo = datosZoho.video_tipo || "link";
      }
      
      await docRef.set(updateData, { merge: true }); // 'merge: true' cuida de no borrar el nombre ni el email

    console.log(`✅ [OK] ${safeId} actualizado. Score Final: ${analisisIA.score}`);
    await processedRef.set({ uid, status: "success", safeId, fecha: admin.firestore.FieldValue.serverTimestamp() });
  }
} catch (error) {
  console.error("❌ Error en analizarCorreos:", error);
} finally {
  if (client) {
    try {
      await client.logout();
    } catch (logoutError) {
      // Si la conexión ya se cerró, ignoramos el error de logout
      if (logoutError.code !== 'NoConnection' && logoutError.code !== 'ClosedAfterConnectTLS') {
        console.error("⚠️ Error al cerrar conexión IMAP:", logoutError.message);
      }
    }
  }
}
}

/////////////////// Anlisis de candidatos /////////////////////



/* ==========================================================================
   🔍 ENDPOINT DE BÚSQUEDA UNIFICADO (Corregido y Optimizado)
   ========================================================================== */
   /* ==========================================================================

   🔍 ENDPOINT DE BÚSQUEDA (MEJORADO: ORDENA MÁS NUEVOS PRIMERO)

   ========================================================================== */

   app.get("/buscar", async (req, res) => {

    try {

      const { q = "", desde = null, hasta = null, limit = 100, startAfter = null } = req.query;

      

      console.log(`📡 Solicitud de búsqueda recibida. Query: "${q}", Limit: ${limit}, StartAfter: ${startAfter ? 'Sí' : 'No'}`);

  

      // USAMOS LA VARIABLE MAESTRA
      let ref = admin.firestore().collection(MAIN_COLLECTION);

      const bloqueados = await obtenerCandidatosBloqueados();
      const termino = q.toLowerCase().trim();
      const limitNum = parseInt(limit) || 100;
      
      // 🔥 MEJORA: Si hay término de búsqueda, buscar en Firestore directamente
      // Firestore no soporta búsqueda full-text nativa, pero podemos hacer queries por campos
      let query = ref.orderBy('creado_en', 'desc');
      
      // Si hay un cursor (startAfter), usarlo para paginación
      if (startAfter) {
        try {
          // startAfter es el ID del último documento
          const lastDoc = await ref.doc(startAfter).get();
          if (lastDoc.exists) {
            // Firestore necesita el documento completo para startAfter
            query = query.startAfter(lastDoc);
          }
        } catch (e) {
          console.warn(`⚠️ Error usando startAfter: ${e.message}`);
        }
      }
      
      // Aplicar límite (aumentamos a 100 por defecto, pero permitimos más)
      query = query.limit(limitNum + 1); // Traemos uno más para saber si hay más resultados
      
      const snap = await query.get();
      

      if (snap.empty) return res.json({ resultados: [], hasMore: false, lastDoc: null });

  

// --- INICIO BLOQUE REEMPLAZADO: MAPEO UNIFICADO ---
let candidatos = snap.docs.map(doc => {
  const data = doc.data();
  
  // 1. Lógica de ordenamiento temporal unificada
  let timestamp = 0;
  if (data.fecha_correo) {
      timestamp = new Date(data.fecha_correo).getTime();
  } else if (data.creado_en) {
      // Soporte para Timestamp de Firebase o string ISO
      timestamp = data.creado_en.toDate ? data.creado_en.toDate().getTime() : new Date(data.creado_en).getTime();
  } else if (data.fecha) {
      timestamp = new Date(data.fecha).getTime();
  }

  // 2. Recuperamos datos visuales y de ESTADO
  const nombreFinal = data.nombre || data.datos_personales?.nombre_completo || data.applicant_email || "Sin Nombre";
  const linkFinal = data.cv_url || data.cv_storage_path || null;

  return {
    id: doc.id,
    nombre: nombreFinal,
    email: data.email || data.applicant_email || "S/E",
    puesto: data.puesto || "Sin puesto",
    cv_url: linkFinal,
    
    // Fechas para ordenar y mostrar
    fecha_orden: timestamp, 
    fecha: data.fecha || data.creado_en, 

    // 🔥 PERSISTENCIA: Leemos las etiquetas reales de la DB
    stage: data.stage || 'stage_1',           
    status_interno: data.status_interno || 'new',
    assignedTo: data.assignedTo || null,      
    history: data.historial_movimientos || [], // <--- CRONOLOGÍA
    origen: data.origen || null, // Origen del candidato (carga_manual, webhook_zoho, etc.)
    
    // Datos de IA y notas
    ia_score: data.ia_score || 0,
    ia_motivos: data.ia_motivos || data.motivo || "Análisis pendiente...", 
    ia_alertas: data.ia_alertas || [],
    video_url: data.video_url || null,
    video_tipo: data.video_tipo || null, // Tipo de video: "link" | "archivo" | "ninguno"
    respuestas_filtro: data.respuestas_filtro || {},
    motivo: data.motivo || "", 
    notes: data.notes || "",
    
    // Datos de gestión de entrevista y formularios
    meet_link: data.meet_link || null,
    informe_final_data: data.informe_final_data || null,
    respuestas_form2: data.respuestas_form2 || null,
    process_step_2_form: data.process_step_2_form || null,
    interview_transcript: data.transcripcion_entrevista || data.interview_transcript || null, // Mapeo para compatibilidad
    transcripcion_entrevista: data.transcripcion_entrevista || null, // Campo original para verificar si está analizada
    
    // Reseñas generadas por IA
    reseña_cv: data.reseña_cv || null,
    reseña_video: data.reseña_video || null,
    video_error: data.video_error || null, // Error si el video no se pudo procesar
    video_link_publico: data.video_link_publico || null, // Si el link es público o no
    
    // 🔧 SOLUCIÓN TEMPORAL: Campo para saltar Form2
    skip_form2: data.skip_form2 || false
  };
})
// --- FIN BLOQUE REEMPLAZADO ---

      .filter(c => {

        // 2. Filtrado por bloqueados y texto

                // CORRECCION: Los candidatos en trash NO deben ser bloqueados
        if (bloqueados.has(c.id.toLowerCase()) && c.stage !== 'trash') return false;

        if (!termino) return true; // Si no escribiste nada, devuelve todo

  

        const matchText = `${c.nombre} ${c.email} ${c.puesto}`.toLowerCase();

        return matchText.includes(termino);

      });

  

      // 3. ORDENAMIENTO FINAL (El número más grande = fecha más reciente = va primero)

      candidatos.sort((a, b) => b.fecha_orden - a.fecha_orden);

      // 4. PAGINACIÓN: Detectar si hay más resultados
      let hasMore = false;
      let lastDoc = null;
      
      if (candidatos.length > limitNum) {
        hasMore = true;
        candidatos = candidatos.slice(0, limitNum); // Quitamos el extra
      }
      
      // El último documento para el cursor
      if (candidatos.length > 0) {
        const lastCandidate = candidatos[candidatos.length - 1];
        lastDoc = lastCandidate.id;
      }

      console.log(`✅ Enviando ${candidatos.length} candidatos ordenados. HasMore: ${hasMore}`);

      res.json({ 
        resultados: candidatos,
        hasMore: hasMore,
        lastDoc: lastDoc,
        total: candidatos.length
      });

  

    } catch (err) {

      console.error("❌ Error en /buscar:", err);

      res.status(500).json({ error: "Error interno del servidor" });

    }

  });

// ==========================================================================
// 🔄 ENDPOINT: ACTUALIZACIÓN DE ESTADO INTERNO (Optimizado)
// ==========================================================================
app.post("/candidatos/:id/resumen", async (req, res) => {
  try {
    const { id } = req.params;
    const { manualData, responsable } = req.body; 

    console.log(`🤖 Iniciando proceso de informe para: ${id}`);

    // --- CASO 1: MODO MANUAL (Candidatos externos o previos) ---
    if (id === 'manual_freelance' && manualData) {
        console.log("⚡ Procesando Informe Manual Directo...");
        
        const informeManual = await generarDatosParaInforme(
            manualData.textoCV,
            manualData.puesto || "Perfil Externo",
            manualData.notas || "",
            {}, // form2 vacío para manual
            "Generación manual directa sin pipeline previo",
            responsable || "Admin"
        );

        if (!informeManual) {
            return res.status(500).json({ error: "Error de Gemini en proceso manual" });
        }

        // Agregar fecha de generación al informe manual
        informeManual.fecha_generacion = new Date().toISOString();
        return res.json(informeManual); // Enviamos directo al dashboard sin guardar en DB
    }

    // --- CASO 2: PROCESO IDEAL (Candidatos del Pipeline) ---
    const docRef = firestore.collection(MAIN_COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        return res.status(404).json({ error: "Candidato no encontrado en el pipeline." });
    }

    const data = doc.data();
    
    // Si ya existe un informe guardado y no pedimos regenerar, lo devolvemos
    if (data.informe_final_data && (!manualData || !manualData.forceRegenerate)) {
        console.log("📄 Devolviendo informe ya existente desde Firestore.");
        // Si el informe existente no tiene fecha_generacion, agregarla usando la fecha de creación del documento
        const informeExistente = { ...data.informe_final_data };
        if (!informeExistente.fecha_generacion) {
            // Intentar usar la fecha de creación del documento o la fecha actual
            const fechaCreacion = doc.createTime ? doc.createTime.toDate().toISOString() : new Date().toISOString();
            informeExistente.fecha_generacion = fechaCreacion;
        }
        return res.json(informeExistente);
    }

    // Si no hay informe, lo generamos usando los datos de Firestore
    const textoCV = manualData?.textoCV || data.texto_extraido || "";
    
    // Recolectar TODOS los datos del pipeline para el informe
    const notasStage1 = data.motivo || data.notes || "";
    const respuestasForm1 = data.respuestas_filtro || {};
    const respuestasForm2 = data.respuestas_form2?.data || {};
    const transcripcion = data.transcripcion_entrevista || "";
    const analisisPostEntrevista = data.ia_motivos || "";
    const alertasPostEntrevista = data.ia_alertas || [];
    
    // 🔥 DETECCIÓN: Form 2 marcado como recibido pero sin datos reales (marcado manualmente)
    const form2MarcadoPeroVacio = data.process_step_2_form === 'received' && Object.keys(respuestasForm2).length === 0;
    
    // Combinar toda la información en un texto para la IA
    const notasCompletas = `
${notasStage1 ? `NOTAS INICIALES (Stage 1):\n${notasStage1}\n\n` : ''}
${Object.keys(respuestasForm1).length > 0 ? `RESPUESTAS FORMULARIO 1 (Zoho):\n${JSON.stringify(respuestasForm1, null, 2)}\n\n` : ''}
${transcripcion ? `TRANSCRIPCIÓN DE ENTREVISTA:\n${transcripcion}\n\n` : ''}
${Object.keys(respuestasForm2).length > 0 ? `RESPUESTAS FORMULARIO 2 (Zoho - Validación Técnica):\n${JSON.stringify(respuestasForm2, null, 2)}\n\n` : ''}
${analisisPostEntrevista ? `ANÁLISIS POST-ENTREVISTA:\n${analisisPostEntrevista}\n\n` : ''}
${alertasPostEntrevista.length > 0 ? `ALERTAS DETECTADAS:\n${alertasPostEntrevista.join(', ')}\n` : ''}
    `.trim();

    const informeGenerado = await generarDatosParaInforme(
        textoCV,
        data.puesto || data.oferta || "Candidato",
        notasCompletas, // Usar las notas combinadas de todo el pipeline
        respuestasForm2, // Form 2 como objeto separado (por si la función lo necesita)
        analisisPostEntrevista, // Análisis post-entrevista
        responsable || data.assignedTo || "Admin",
        form2MarcadoPeroVacio // Flag: true si Form 2 está marcado pero vacío
    );

    if (informeGenerado) {
        // Agregar fecha de generación al informe antes de guardarlo
        informeGenerado.fecha_generacion = new Date().toISOString();
        
        // Guardamos el informe en Firestore para que ya quede entrelazado
        await docRef.update({ 
            informe_final_data: informeGenerado,
            report_generated: true,
            
            // HISTORIAL: Informe generado
            historial_movimientos: admin.firestore.FieldValue.arrayUnion({
                date: new Date().toISOString(),
                event: 'Informe Generado',
                detail: `Informe final generado por: ${responsable || data.assignedTo || "Admin"}`,
                usuario: responsable || data.assignedTo || "Admin"
            })
        });
        return res.json(informeGenerado);
    } else {
        return res.status(500).json({ error: "Error al generar el informe con Gemini." });
    }

  } catch (error) {
    console.error("❌ Error en ruta de resumen:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});




/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////7 comunicacion con el frontend ///////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////entrevistas ( actualizar) ////////////////////////////////////////

const ENTREV_COL = "entrevistas";

// normaliza para filtros "contains" case-insensitive
const _norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// fuerza entero [1..10]
function _clamp1to10(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
}

/* ===================== LISTAR ====================== */
app.get("/entrevistas", async (req, res) => {
  try {
    const nameQ = _norm(req.query.name || "");
    const areaQ = _norm(req.query.area || "");

    const snap = await firestore.collection(ENTREV_COL).get();
    const out = [];
    for (const d of snap.docs) {
      const it = d.data() || {};
      const name = it.name || d.id || "";
      const area = it.area || "";
      const passName = !nameQ || _norm(name).includes(nameQ);
      const passArea = !areaQ || _norm(area).includes(areaQ);
      if (!passName || !passArea) continue;

      out.push({
        id: d.id,
        name,
        area,
        language: it.language || "es",
        createdAt: it.createdAt
          ? (it.createdAt.toMillis ? it.createdAt.toMillis() : it.createdAt)
          : null,
        analisis: it.analisis || null, // cache si existe
      });
    }
    res.json(out);
  } catch (err) {
    console.error("❌ /entrevistas (listar):", err);
    res.status(500).json({ error: "Error obteniendo entrevistas" });
  }
});

/* ===================== DETALLE ====================== */


app.get("/entrevistas/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const ref = firestore.collection(ENTREV_COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Entrevista no encontrada" });

    const it = snap.data() || {};
    res.json({
      id: snap.id,
      name: it.name || snap.id,
      area: it.area || "",
      language: it.language || "es",
      text: it.text || it.transcripcion || "",
      createdAt: it.createdAt
        ? (it.createdAt.toMillis ? it.createdAt.toMillis() : it.createdAt)
        : null,
      analisis: it.analisis || null,
    });
  } catch (err) {
    console.error("❌ /entrevistas/:id (detalle):", err);
    res.status(500).json({ error: "Error obteniendo la entrevista" });
  }
});


async function analizarEntrevistaConIA(nombre, { force = false } = {}) {
  const ref = firestore.collection(ENTREV_COL).doc(nombre);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`No existe entrevista "${nombre}" en '${ENTREV_COL}'.`);

  const it = snap.data() || {};
  const name = it.name || nombre;
  const area = it.area || "No especificada";
  const text = it.text || it.transcripcion || "";

  if (!force && it.analisis && typeof it.analisis === "object") {
    return it.analisis; // devolver cache ya guardado
  }

  // —— Guion de preguntas clave que debe cubrir la entrevista —— //
  const cuestionario = `
1) Presentación y motivación/razón para postular.
2) Experiencia relevante (rol/proyecto que marcó la trayectoria).
3) Situación actual / búsqueda activa (por qué ahora).
4) Compromisos actuales (estudios/trabajo): confirmar DEDICACIÓN FULL TIME y aceptación de monitoreo continuo.
5) Procesos/Flujos de trabajo manejados.
6) Software/CRM conocidos.
7) Modalidad remota: organización del tiempo y cumplimiento diario.
8) Aptitud/actitud para el rol (cómo debe ser la persona en esta área).
9) Cierre: acuerdo con salario/condiciones/horario y dudas.
`.trim();

  // —— PROMPT ROBUSTO —— //
  const prompt = `
Eres evaluador senior de RRHH.
Analiza la ENTREVISTA transcrita (en español) y devuelve SOLO JSON válido.

DEBES:
- Puntuar con enteros 1–10: habilidades blandas (comunicación, colaboración, proactividad), técnicos (acorde al rol), fit_cultural, disponibilidad.
- Evaluar CONSISTENCIA (1–10): qué tan directamente responde a lo que se pregunta y si sus respuestas son coherentes con las condiciones del rol (full time, monitoreo) y con lo que afirmó antes.
- Construir una MATRIZ DE CONGRUENCIA por cada punto del cuestionario (respondio: true/false; evidencia: breve cita/paráfrasis).
- Detectar ALERTAS (strings): p.ej., "Doble compromiso", "No acepta monitoreo", "No acuerda salario/horario", "Respuestas vagas", "Contradicciones".

INTERPRETACIÓN DE “NO” (REGLAS IMPORTANTES):
- Diferencia entre un "No" de cortesía/cierre (p. ej., "No, no tengo preguntas", "No, gracias") y un "No" de RECHAZO explícito (p. ej., "No acepto el monitoreo", "No estoy de acuerdo con el horario completo", "No acepto el salario").
- Si detrás de un "No" el candidato dice algo como "Estoy de acuerdo con todo lo comentado", interpreta como ACEPTACIÓN de condiciones.
- Solo marca alertas por rechazo si hay EXPRESIÓN CLARA de rechazo. Evita falsos positivos por "No" sin contexto.

Contexto del rol: "${area}"
Candidato: "${name}"

CUESTIONARIO:
${cuestionario}

TRANSCRIPCIÓN (solo respuestas del candidato):
"""
${text}
"""

Formato EXACTO:
{
  "nombre": "${name}",
  "area": "${area}",
  "habilidades_blandas": { "comunicacion": n, "colaboracion": n, "proactividad": n },
  "tecnicos": n,
  "fit_cultural": n,
  "disponibilidad": n,
  "consistencia": n,
  "congruencia": [
    { "item": "presentacion_motivacion", "respondio": true, "evidencia": "..." },
    { "item": "experiencia_relevante", "respondio": true, "evidencia": "..." },
    { "item": "situacion_actual", "respondio": true, "evidencia": "..." },
    { "item": "compromiso_fulltime_monitoreo", "respondio": true, "evidencia": "..." },
    { "item": "procesos_flujos", "respondio": true, "evidencia": "..." },
    { "item": "software_crm", "respondio": true, "evidencia": "..." },
    { "item": "remoto_organizacion", "respondio": true, "evidencia": "..." },
    { "item": "aptitud_actitud", "respondio": true, "evidencia": "..." },
    { "item": "cierre_condiciones", "respondio": true, "evidencia": "..." }
  ],
  "alertas": ["..."],
  "observaciones": "máx 280 chars"
}

Reglas:
- Todos los "n" enteros 1–10.
- Si el transcript no cubre un punto, respondio=false y evidencia="sin evidencia".
- Sé estricto con full time y aceptación de monitoreo SOLO si hay rechazo explícito; si hay aceptación global posterior, cuéntalo como aceptado.
- 'alertas' vacío si no hay flags reales.
`.trim();

  const completion = await openai.chat.completions.create({
    model: process.env.AI_MODEL || "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Responde únicamente en JSON válido, sin explicaciones." },
      { role: "user", content: prompt },
    ],
  });

  // parseo robusto
  let parsed = {};
  try {
    const raw = completion?.choices?.[0]?.message?.content || "{}";
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  // clamp y seguros
  const h = parsed.habilidades_blandas || {};
  const comunicacion = _clamp1to10(h.comunicacion);
  const colaboracion = _clamp1to10(h.colaboracion);
  const proactividad = _clamp1to10(h.proactividad);
  const tecnicos = _clamp1to10(parsed.tecnicos);
  const fit_cultural = _clamp1to10(parsed.fit_cultural);
  const disponibilidad = _clamp1to10(parsed.disponibilidad);
  const consistencia = _clamp1to10(parsed.consistencia);

  const congruencia = Array.isArray(parsed.congruencia) ? parsed.congruencia : [];
  const alertas = Array.isArray(parsed.alertas) ? parsed.alertas.slice(0, 10) : [];

  // promedio PONDERADO (más peso a disponibilidad y consistencia)
  const pesos = { soft: 1, tecnicos: 1, fit: 1, disp: 1.5, cons: 1.5 };
  const sumaPesos = pesos.soft + pesos.tecnicos + pesos.fit + pesos.disp + pesos.cons;
  const softAvg = (comunicacion + colaboracion + proactividad) / 3;

  const promedio = Math.round(((
    (softAvg * pesos.soft) +
    (tecnicos * pesos.tecnicos) +
    (fit_cultural * pesos.fit) +
    (disponibilidad * pesos.disp) +
    (consistencia * pesos.cons)
  ) / sumaPesos) * 10) / 10;

  const analisis = {
    nombre: name,
    area,
    habilidades_blandas: { comunicacion, colaboracion, proactividad },
    tecnicos,
    fit_cultural,
    disponibilidad,
    consistencia,
    congruencia,
    alertas,
    promedio,
    observaciones: String(parsed.observaciones || "").slice(0, 280),
    actualizadoEn: new Date().toISOString(),
  };

  // 💾 Guardar cache en el mismo documento de Firestore:
  // entrevistas/{nombre}.analisis
  await ref.set(
    { analisis, analizadoAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  return analisis;
}

/* ===================== PUNTAJE ====================== */
app.get("/entrevistas/:nombre/puntaje", async (req, res) => {
  try {
    const force = String(req.query.force || "false") === "true";
    const analisis = await analizarEntrevistaConIA(req.params.nombre, { force });
    res.json(analisis);
  } catch (err) {
    console.error("❌ /entrevistas/:nombre/puntaje:", err);
    res.status(400).json({ error: err.message || "No fue posible obtener el puntaje" });
  }
});

//////////mostrar carpetas de la bbase de datos////////

async function listPrefixes(prefix) {
  const bucket = getStorage().bucket();
  const [_, __, apiResponse] = await bucket.getFiles({
    prefix,
    delimiter: '/', // devuelve los subdirectorios directos
  });

  const prefixes = apiResponse?.prefixes || [];
  return prefixes.map(p => p.replace(prefix, '').replace(/\/$/, '')).filter(Boolean);
}

// Lista archivos dentro de una carpeta y genera URLs firmadas
async function listFilesWithSignedUrls(prefix, { nombre } = {}) {
  const bucket = getStorage().bucket();
  const [files] = await bucket.getFiles({ prefix });

  const out = [];
  for (const file of files) {
    if (file.name.endsWith('/')) continue; // ignora carpetas
    const baseName = file.name.split('/').pop(); // nombre del archivo sin ruta

    if (nombre && !baseName.toLowerCase().includes(nombre.toLowerCase())) continue;

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });

    out.push({ nombre: baseName, url });
  }

  return out;
}

// 🔹 Obtiene los nombres de archivos ya clasificados en Firestore (SOLO CVs_staging)
async function obtenerNombresArchivados() {
  const nombres = new Set();

  try {
    const snap = await firestore.collection(MAIN_COLLECTION).get();
    
    snap.forEach(doc => {
      const data = doc.data();

      // Campo normal
      if (data.nombre_archivo) {
        nombres.add(data.nombre_archivo.trim().toLowerCase());
      }

      // También por email si existe
      if (data.applicant_email) {
        nombres.add(data.applicant_email.trim().toLowerCase());
      }
      
      // También por nombre del archivo CV si existe
      if (data.cv_storage_path) {
        const nombreArchivo = data.cv_storage_path.split('/').pop();
        if (nombreArchivo) {
          nombres.add(nombreArchivo.trim().toLowerCase());
        }
      }
    });
  } catch (error) {
    console.warn("Error obteniendo nombres archivados:", error);
  }

  console.log('🔥 Archivos ya clasificados:', Array.from(nombres));
  return nombres;
}

// 🔹 Endpoint: listar archivos con exclusión de los ya clasificados
app.get('/firebase-storage/archivos', verifyToken, async (req, res) => {
  try {
    const { carpeta, subcarpeta = '', nombre = '' } = req.query;
    if (!carpeta)
      return res.status(400).json({ error: 'Falta el nombre de la carpeta' });

    const prefix =
      `${ROOT_PREFIX}${carpeta}/` +
      (subcarpeta ? `${subcarpeta.replace(/^\/|\/$/g, '')}/` : '');

    // 1️⃣ Listar archivos del Storage
    const archivos = await listFilesWithSignedUrls(prefix, { nombre });

    // 2️⃣ Obtener los nombres archivados
    const nombresArchivados = await obtenerNombresArchivados();

    // 3️⃣ Filtrar los que ya existen en Firestore
    const filtrados = archivos.filter(
      a => !nombresArchivados.has(a.nombre.toLowerCase())
    );

    console.log(`📂 ${carpeta}: ${filtrados.length}/${archivos.length} archivos visibles`);
    res.json(filtrados);
  } catch (error) {
    console.error('Error al listar archivos:', error);
    res.status(500).json({ error: 'No se pudieron obtener los archivos.' });
  }
});

// 🔹 Endpoint: listar carpetas de primer nivel
app.get('/firebase-storage/carpetas', verifyToken, async (req, res) => {
  try {
    const carpetas = await listPrefixes(ROOT_PREFIX);
    res.json(carpetas);
  } catch (error) {
    console.error('Error al listar carpetas:', error);
    res.status(500).json({ error: 'No se pudieron obtener las carpetas.' });
  }
});

//////////////////////// generador de fichas tecnicas ///////////////////////

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) { }
}

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.post("/ficha_subida", upload.single("cv"), async (req, res) => {
  console.log("\n=== [/ficha_subida] INICIO (Node.js) ===");

  if (!STORAGE_READY) {
    return res.status(503).json({ error: "Storage no disponible." });
  }

  const textoPegado = (req.body?.textoPegado || "").trim() || "Informe generado sin notas adicionales.";
  const conLogo = String(req.body?.conLogo || "true").toLowerCase() !== "false";
  const file = req.file;

  if (!file?.path || !file?.originalname) {
    return res.status(400).json({ error: "Falta el archivo PDF ('cv')." });
  }

  try {
    // Crear carpetas temporales
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ficha-up-"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ficha-out-"));

    // Nombre base del archivo
    const baseRaw = path.basename(file.originalname).replace(/\.pdf$/i, "");
    const base = baseRaw.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);

    // Logo path (opcional)
    const logoPath = conLogo ? path.join(__dirname, "logo.png") : null;

    // ✅ LLAMAR AL NUEVO MÓDULO NODE.JS
    const result = await fichaGenerator.generarFicha({
      cvPath: file.path,
      extraText: textoPegado,
      outputDir: outDir,
      baseName: base,
      logoPath: fs.existsSync(logoPath) ? logoPath : null
    });

    if (!result.ok || !result.docx || !fs.existsSync(result.docx)) {
      return res.status(500).json({ error: "No se generó el archivo .docx." });
    }

    // Subir DOCX a Firebase
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = `fichas-generadas/${base}/${ts}/${path.basename(result.docx)}`;

    await bucket.upload(result.docx, {
      destination: dest,
      metadata: {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });

    // URL firmada 10 min
    const [urlDocx] = await bucket.file(dest).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: `attachment; filename="${path.basename(dest)}"`,
    });

    // Limpiar temporales
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
      if (file.path) fs.unlinkSync(file.path);
    } catch (e) { /* ignorar errores de limpieza */ }

    return res.json({
      message: "✅ Ficha generada (Node.js)",
      url: urlDocx,
      storagePath: dest,
    });

  } catch (e) {
    console.error("[ERROR /ficha_subida]", e);
    return res.status(500).json({ error: "Error generando la ficha: " + e.message });
  }
});



app.post('/ficha_recibida', async (req, res) => {
  console.log('=== [/ficha_recibida] INICIO (Node.js) ===');
  
  try {
    const { textoPegado, nombreCV, conLogo } = req.body || {};
    if (!nombreCV) return res.status(400).json({ error: 'Falta el nombre del CV.' });

    // Normalizar nombre para búsqueda
    const cleanName = nombreCV.trim().toLowerCase().replace(/\s+/g, ' ');
    console.log('[REQ.body]', { textoPegado_preview: textoPegado?.slice(0, 200), nombreCV });

    // Buscar el PDF en Storage
    const searchPrefix = `${ROOT_PREFIX}`;
    const [files] = await bucket.getFiles({ prefix: searchPrefix });
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));

    const normalize = s => s.toLowerCase()
      .replace(/[_\-\.]+/g, ' ')
      .replace(/\.pdf$/, '')
      .trim();

    let matchedFile = null;
    for (const file of pdfs) {
      const base = file.name.split('/').pop();
      if (!base) continue;
      const normBase = normalize(base);
      if (normBase.includes(cleanName) || cleanName.includes(normBase)) {
        matchedFile = file;
        break;
      }
    }

    if (!matchedFile) {
      return res.status(404).json({
        error: `No se encontró ningún PDF que coincida con "${nombreCV}".`
      });
    }

    console.log('[Archivo encontrado]', { matchedName: matchedFile.name });

    // Crear carpetas temporales
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ficha-recibida-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ficha-out-'));

    // Descargar el PDF
    const tmpPdfPath = path.join(tmpDir, path.basename(matchedFile.name));
    await matchedFile.download({ destination: tmpPdfPath });
    console.log('[Descarga completada]', { tmpPdfPath });

    // Logo path (opcional)
    const logoPath = conLogo ? path.join(__dirname, 'logo.png') : null;

    // ✅ LLAMAR AL NUEVO MÓDULO NODE.JS
    const result = await fichaGenerator.generarFicha({
      cvPath: tmpPdfPath,
      extraText: textoPegado || '',
      outputDir: outDir,
      baseName: path.basename(matchedFile.name, '.pdf'),
      logoPath: fs.existsSync(logoPath) ? logoPath : null
    });

    if (!result.ok || !result.docx || !fs.existsSync(result.docx)) {
      return res.status(500).json({ error: 'No se generó ningún archivo .docx.' });
    }

    // Subir a Storage
    const destName = `fichas-generadas/${Date.now()}-${path.basename(result.docx)}`;
    await bucket.upload(result.docx, { destination: destName });
    console.log('[DOCX subido al bucket]', { destName });

    // URL firmada
    const [url] = await bucket.file(destName).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000
    });

    // Limpiar temporales
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch (e) { /* ignorar */ }

    res.json({ url });

  } catch (e) {
    console.error('[ERROR /ficha_recibida]', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
});

const calendarRoutes = require("./calendar");
app.use("/calendar", calendarRoutes);

app.get("/firebase-storage/carpetas", async (req, res) => {
  try {
    const [files] = await bucket.getFiles({ delimiter: "/" });

    const carpetas = files.prefixes || [];

    // Limpiar nombres
    const nombres = carpetas.map(c => c.replace(/\/$/, ""));

    res.json(nombres);
  } catch (err) {
    console.error("❌ Error listando carpetas:", err);
    res.status(500).json({ error: "No se pudieron obtener las carpetas" });
  }
});

app.get("/firebase-storage/archivos", async (req, res) => {
  try {
    const { carpeta, nombre = "" } = req.query;
    if (!carpeta) return res.status(400).json({ error: "Carpeta requerida" });

    const prefix = `${carpeta}/`;

    // Obtener todos los archivos de Storage
    const [files] = await bucket.getFiles({ prefix });

    // Obtener IDs ya usados
    const bloqueados = await obtenerCandidatosBloqueados();

    // Filtrar
    const filtrados = files
      .filter(f => {
        const archivo = f.name.replace(prefix, "").trim().toLowerCase();

        const coincide = archivo.includes(nombre.toLowerCase());
        const estaBloqueado = bloqueados.has(archivo);

        // Solo mostrar SI NO está bloqueado
        return coincide && !estaBloqueado;
      })
      .map(f => ({
        nombre: f.name.replace(prefix, ""),
        url: f.publicUrl()
      }));

    res.json(filtrados);
  } catch (err) {
    console.error("❌ Error listando archivos:", err);
    res.status(500).json({ error: "No se pudieron obtener los archivos" });
  }
});

///////////////////////boton buscar candidato//////////////////////

async function registrarConsultaCandidato(usuario, candidatoId) {
  await firestore.collection("metricas_consultas").add({
    usuario,
    candidatoId,
    fecha: admin.firestore.Timestamp.now(),
  });
}
async function obtenerBloqueados() {
  const snap = await firestore.collection("candidatos_bloqueados").get();
  const map = {};

  snap.forEach(d => {
    const data = d.data();
    map[d.id] = data;
  });

  return map;
}
async function bloquearCandidatosParaUsuario(usuario, candidatos) {
  const ahora = Date.now();
  const expira = ahora + 5 * 60 * 1000; // 5 min

  for (const c of candidatos) {
    await firestore.collection("candidatos_bloqueados")
      .doc(c.id)
      .set({
        usuario,
        candidatoId: c.id,
        bloqueadoDesde: ahora,
        expira,
      });
  }
}
async function limpiarBloqueosExpirados() {
  const ahora = Date.now();
  const snap = await firestore.collection("candidatos_bloqueados").get();

  for (const d of snap.docs) {
    if (d.data().expira < ahora) {
      await d.ref.delete();
    }
  }
}
async function obtenerCandidatosMovidos() {
  // Solo candidatos que NO están en stage_1 (ya fueron procesados)
  const movidos = new Set();
  
  try {
    // Obtener candidatos en stage_2, stage_3 o trash
    const snap = await firestore.collection(MAIN_COLLECTION)
      .where("stage", "in", ["stage_2", "stage_3", "trash"])
      .get();
    
    snap.forEach(d => movidos.add(d.id));
  } catch (error) {
    // Si falla la query con "in", hacer queries separadas
    try {
      const stage2Snap = await firestore.collection(MAIN_COLLECTION)
        .where("stage", "==", "stage_2")
        .get();
      stage2Snap.forEach(d => movidos.add(d.id));
      
      const stage3Snap = await firestore.collection(MAIN_COLLECTION)
        .where("stage", "==", "stage_3")
        .get();
      stage3Snap.forEach(d => movidos.add(d.id));
      
      const trashSnap = await firestore.collection(MAIN_COLLECTION)
        .where("stage", "==", "trash")
        .get();
      trashSnap.forEach(d => movidos.add(d.id));
    } catch (e) {
      console.warn("Error obteniendo candidatos movidos:", e);
    }
  }

  return movidos;
}


app.get("/resumen/:id", async (req, res) => {
  try {
    const id = req.params.id;
    // Buscamos en la colección correcta 'CVs_aprobados'
    const snap = await firestore.collection(MAIN_COLLECTION).doc(id).get();
    
    if (!snap.exists) return res.json({ resumen: "Candidato no encontrado" });
    const c = snap.data();

    // Contexto para el Bot Redactor
    const fuente = `
      PERFIL: ${c.nombre || "N/A"}
      PUESTO: ${c.puesto || "N/A"}
      EXPERIENCIA: ${JSON.stringify(c.experiencia || []).slice(0, 2000)}
      HABILIDADES: ${JSON.stringify(c.habilidades || {})}
    `;

    // INSTRUCCIONES PARA EL BOT REDACTOR 👇
    const prompt = `
      Actúa como Consultor Senior de RRHH. Redacta un informe ejecutivo breve (max 10 lineas) sobre este candidato.
      Estructura:
      1. Perfil Profesional (Resumen de impacto).
      2. Fortalezas Clave (Listado breve).
      3. Recomendación (Por qué contratarlo).
      
      Usa un tono formal y persuasivo.
      DATOS: ${fuente}
    `;

    // Usamos Gemini
    const result = await model.generateContent(prompt);
    const resumen = result.response.text();

    return res.json({ resumen });

  } catch (err) {
    console.error("❌ Error generando resumen:", err.message);
    return res.status(500).json({ error: "Error al generar informe con IA" });
  }
});

/////////////////////////////////////  MÉTRICAS PARA PANEL  /////////////////////////////////////
const db = admin.firestore();
app.get("/panel/metrics", async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    /* ===========================================================
       🔵 MÉTRICAS FINALES (SOLO CVs_staging)
       =========================================================== */

    const totals = {
      enProceso: 0,
      contratados: 0,
      descartados: 0,
      aprobados: 0,
      rechazados: 0,
    };

    const porDia = {};

    /* ===========================================================
       🔵 1. LEER MÉTRICAS DESDE CVs_staging (ÚNICA FUENTE)
       =========================================================== */

    const stagingSnap = await firestore.collection(MAIN_COLLECTION).get();

    stagingSnap.forEach((doc) => {
      const data = doc.data();
      if (!data) return;

      const stage = data.stage || 'stage_1';
      const statusInterno = data.status_interno || 'new';

      // Contar por stage
      if (stage === 'stage_2') totals.enProceso++;
      if (stage === 'stage_3') totals.contratados++;
      if (stage === 'trash') totals.descartados++;

      // Contar aprobados/rechazados basado en historial
      const historial = data.historial_movimientos || [];
      historial.forEach((evento) => {
        if (evento.event === "Aprobado a Gestión") totals.aprobados++;
        if (evento.event === "Movido a Papelera") totals.rechazados++;

        // Agrupar por día
        if (evento.date) {
          const fecha = new Date(evento.date).toISOString().split("T")[0];
          if (!porDia[fecha]) {
            porDia[fecha] = {
              enProceso: 0,
              contratados: 0,
              descartados: 0,
              aprobados: 0,
              rechazados: 0,
            };
          }
          if (evento.event === "Aprobado a Gestión") porDia[fecha].aprobados++;
          if (evento.event === "Movido a Papelera") porDia[fecha].rechazados++;
        }
      });

      // Agrupar stages por día de actualización
      if (data.actualizado_en) {
        const fecha = new Date(data.actualizado_en).toISOString().split("T")[0];
        if (!porDia[fecha]) {
          porDia[fecha] = {
            enProceso: 0,
            contratados: 0,
            descartados: 0,
            aprobados: 0,
            rechazados: 0,
          };
        }
        if (stage === 'stage_2') porDia[fecha].enProceso++;
        if (stage === 'stage_3') porDia[fecha].contratados++;
        if (stage === 'trash') porDia[fecha].descartados++;
      }
    });

    /* ===========================================================
       🔵 3. MÉTRICAS POR USUARIO (consultas y movimientos)
       =========================================================== */

    const consultasSnap = await firestore
      .collection("metricas_consultas")
      .where("fecha", ">=", hoy)
      .get();

    const movimientosSnap = await firestore
      .collection("metricas_movimientos")
      .where("fecha", ">=", hoy)
      .get();

    const usuariosSet = new Set();
    const detalleUsuarios = {};

    consultasSnap.forEach((d) => {
      const { usuario, fecha } = d.data() || {};
      if (!usuario) return;

      usuariosSet.add(usuario);

      if (!detalleUsuarios[usuario]) {
        detalleUsuarios[usuario] = {
          email: usuario,
          consultas: 0,
          movimientos: 0,
          ultimaActividad: null
        };
      }

      detalleUsuarios[usuario].consultas++;
      detalleUsuarios[usuario].ultimaActividad = fecha?.toDate().toLocaleString();
    });

    movimientosSnap.forEach((d) => {
      const { usuario, fecha } = d.data() || {};
      if (!usuario) return;

      usuariosSet.add(usuario);

      if (!detalleUsuarios[usuario]) {
        detalleUsuarios[usuario] = {
          email: usuario,
          consultas: 0,
          movimientos: 0,
          ultimaActividad: null
        };
      }

      detalleUsuarios[usuario].movimientos++;
      detalleUsuarios[usuario].ultimaActividad = fecha?.toDate().toLocaleString();
    });

    /* ===========================================================
       🔵 4. RESPUESTA FINAL
       =========================================================== */

    res.json({
      totals,
      porDia,
      totalUsuarios: usuariosSet.size,
      usuariosActivosHoy: usuariosSet.size,
      consultasHoy: consultasSnap.size,
      movimientosHoy: movimientosSnap.size,
      detalleUsuarios: Object.values(detalleUsuarios)
    });

  } catch (err) {
    console.error("ERROR en /panel/metrics:", err);
    res.status(500).json({ error: "Error obteniendo métricas" });
  }
});


async function parsearBusquedaIA(query) {
  if (!query || !query.trim()) {
    return {
      area_requerida: "",
      areas_afines: [],
      habilidades_tecnicas: [],
      experiencia_minima_anios: 0,
      nivel_ingles: "",
      modalidad: "",
      ubicacion_preferida: "",
      palabras_clave: []
    };
  }

  const prompt = `
Eres un asistente de recursos humanos. Analiza esta búsqueda y extrae los requisitos estructurados.

BÚSQUEDA: "${query}"

Devuelve SOLO JSON válido con este formato EXACTO:
{
  "area_requerida": "área principal del puesto (ej: 'diseño gráfico', 'desarrollo web', 'asistente virtual')",
  "areas_afines": ["área1", "área2"],
  "habilidades_tecnicas": ["habilidad1", "habilidad2"],
  "experiencia_minima_anios": número o 0,
  "nivel_ingles": "básico|intermedio|avanzado|nativo o vacío",
  "modalidad": "remoto|presencial|híbrido o vacío",
  "ubicacion_preferida": "ciudad/país o vacío",
  "palabras_clave": ["palabra1", "palabra2"]
}

EJEMPLOS:

Búsqueda: "Necesito un diseñador gráfico con 3 años de experiencia en Photoshop e Illustrator"
Respuesta:
{
  "area_requerida": "diseño gráfico",
  "areas_afines": ["diseño digital", "diseño web", "creativo"],
  "habilidades_tecnicas": ["photoshop", "illustrator", "adobe"],
  "experiencia_minima_anios": 3,
  "nivel_ingles": "",
  "modalidad": "",
  "ubicacion_preferida": "",
  "palabras_clave": ["diseño", "gráfico", "photoshop", "illustrator"]
}

Búsqueda: "Asistente virtual bilingüe para soporte al cliente, trabajo remoto"
Respuesta:
{
  "area_requerida": "asistente virtual",
  "areas_afines": ["atención al cliente", "soporte", "customer service"],
  "habilidades_tecnicas": ["crm", "comunicación", "gestión"],
  "experiencia_minima_anios": 0,
  "nivel_ingles": "avanzado",
  "modalidad": "remoto",
  "ubicacion_preferida": "",
  "palabras_clave": ["asistente", "virtual", "bilingüe", "soporte", "cliente"]
}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Devuelve SOLO JSON válido sin texto adicional." },
        { role: "user", content: prompt }
      ],
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // Validación y normalización
    return {
      area_requerida: normStr(result.area_requerida || ""),
      areas_afines: (result.areas_afines || []).map(normStr),
      habilidades_tecnicas: (result.habilidades_tecnicas || []).map(normStr),
      experiencia_minima_anios: Number(result.experiencia_minima_anios) || 0,
      nivel_ingles: normStr(result.nivel_ingles || ""),
      modalidad: normStr(result.modalidad || ""),
      ubicacion_preferida: normStr(result.ubicacion_preferida || ""),
      palabras_clave: (result.palabras_clave || []).map(normStr)
    };

  // ... (aquí termina el cierre de la función parsearBusquedaIA) ...
} catch (err) {
  console.error("❌ Error en parsearBusquedaIA:", err);
  return {
    area_requerida: "",
    areas_afines: [],
    habilidades_tecnicas: [],
    experiencia_minima_anios: 0,
    nivel_ingles: "",
    modalidad: "",
    ubicacion_preferida: "",
    palabras_clave: []
  };
}
}
// ====================================================================
// 🧠 CEREBRO V3: BLINDADO PARA NOTAS VAGAS O DESESTRUCTURADAS
// ====================================================================
async function generarDatosParaInforme(textoCV, puesto, notas, form2, analisisPrevio, responsable, form2MarcadoPeroVacio = false) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 🔥 DETECCIÓN: ¿Es pipeline? (tiene analisisPrevio o datos de Form 2)
    const esPipeline = analisisPrevio && analisisPrevio !== "Generación manual directa sin pipeline previo";
    
    let seccionFuentes = "";
    
    if (esPipeline) {
      // 🔥 DISTRIBUCIÓN CONDICIONAL: Si Form 2 está marcado pero vacío, redistribuir pesos
      if (form2MarcadoPeroVacio) {
        // DISTRIBUCIÓN B (Form 2 vacío): Notas como fuente principal
        seccionFuentes = `
      --- FUENTES DE INFORMACIÓN (100% DEL PESO TOTAL) ---
      ⚠️ NOTA IMPORTANTE: El Formulario 2 fue marcado como recibido manualmente pero no contiene datos estructurados del webhook. Las NOTAS DEL RECLUTADOR pueden incluir las respuestas del Form 2 escritas manualmente.
      
      1. **NOTAS DEL RECLUTADOR (Stage 1 y notas manuales) – 50% del peso total**
         *Instrucción:* Estas notas son la fuente principal del informe. Pueden contener:
         - Respuestas del Formulario 2 escritas manualmente por el reclutador.
         - Herramientas y tecnologías mencionadas.
         - Niveles de manejo (Avanzado / Sólido / Básico).
         - Nivel de inglés REAL observado.
         - Disponibilidad real, motivación, fit cultural.
         - Soft skills y habilidades blandas observadas.
         - Fortalezas y debilidades mencionadas por el reclutador.
      
      2. **ANÁLISIS POST-ENTREVISTA (IA) – 20% del peso total**
         *Instrucción:* Usá este análisis como síntesis estructurada de la entrevista.
         La TRANSCRIPCIÓN cruda de la entrevista NO es una fuente independiente: solo debe influir a través de este análisis.
      
      3. **RESPUESTAS FORMULARIO 1 + ALERTAS DETECTADAS – 15% del peso total combinado**
         *Instrucción:*
         - Usá Formulario 1 como contexto inicial (datos de postulación).
         - Usá las ALERTAS para ajustar la conclusión final (banderas rojas o riesgos).
      
      4. **CV DEL CANDIDATO (SOLO DATOS DUROS) – 5% del peso total**
         Contenido del CV (texto extraído):
         ${textoCV.slice(0, 20000)}
         *Instrucción:* Usá el CV ÚNICAMENTE para:
         - Nombre completo.
         - Título universitario o formación principal.
         - Ubicación.
         - Empresas anteriores y años de experiencia.
         NO uses el CV para evaluar nivel técnico ni soft skills (eso viene de los puntos 1 a 3).
      
      5. **RESPUESTAS FORMULARIO 2 – 0% del peso total**
         *Instrucción:* No hay datos estructurados del Formulario 2 disponibles. Toda la información relevante debe venir de las NOTAS DEL RECLUTADOR.
      
      **RESUMEN DE PESOS:** Notas (50%) + Análisis (20%) + Form 1 + Alertas (15%) + CV (5%) + Form 2 (0%) = 100% del informe final.
      `;
      } else {
        // DISTRIBUCIÓN ORIGINAL (Form 2 con datos reales del webhook)
        seccionFuentes = `
      --- FUENTES DE INFORMACIÓN (100% DEL PESO TOTAL) ---
      
      1. **RESPUESTAS FORMULARIO 2 (Validación Técnica) – 40% del peso total**
         Contenido disponible en el bloque de notas del proceso:
         ${notas}
                  
         *Instrucción:* Tomá de aquí principalmente:
         - Herramientas y tecnologías declaradas.
         - Niveles de manejo (Avanzado / Sólido / Básico).
         - Soft skills que el formulario ayude a validar.
      
      2. **NOTAS DEL RECLUTADOR (Stage 1 y notas manuales) – 30% del peso total**
         *Instrucción:* Estas notas representan la mirada humana del proceso.
         Priorizá desde aquí:
         - Nivel de inglés REAL observado.
         - Disponibilidad real, motivación, fit cultural.
         - Fortalezas y debilidades mencionadas por el reclutador.
      
      3. **ANÁLISIS POST-ENTREVISTA (IA) – 15% del peso total**
         *Instrucción:* Usá este análisis como síntesis estructurada de la entrevista.
         La TRANSCRIPCIÓN cruda de la entrevista NO es una fuente independiente: solo debe influir a través de este análisis.
      
      4. **RESPUESTAS FORMULARIO 1 + ALERTAS DETECTADAS – 10% del peso total combinado**
         *Instrucción:*
         - Usá Formulario 1 como contexto inicial (datos de postulación).
         - Usá las ALERTAS para ajustar la conclusión final (banderas rojas o riesgos).
      
      5. **CV DEL CANDIDATO (SOLO DATOS DUROS) – 5% del peso total**
         Contenido del CV (texto extraído):
         ${textoCV.slice(0, 20000)}
         *Instrucción:* Usá el CV ÚNICAMENTE para:
         - Nombre completo.
         - Título universitario o formación principal.
         - Ubicación.
         - Empresas anteriores y años de experiencia.
         NO uses el CV para evaluar nivel técnico ni soft skills (eso viene de los puntos 1 a 4).
      
      **RESUMEN DE PESOS:** Form 2 (40%) + Notas (30%) + Análisis (15%) + Form 1 + Alertas (10%) + CV (5%) = 100% del informe final.
      `;
      }
    } else {
      // DISTRIBUCIÓN SIMPLE (modo manual, sin pipeline)
      seccionFuentes = `
      --- FUENTES DE INFORMACIÓN ---
      1. **NOTAS DEL RECLUTADOR (PRIORIDAD TOTAL - 90%):** "${notas}"
         *Instrucción:* Estas notas contienen la verdad sobre el candidato. Extrae de aquí: nivel de inglés real, disponibilidad, skills técnicas validadas y habilidades blandas observadas. Si el texto es un párrafo corrido, DESGLÓSALO.

      2. **CV DEL CANDIDATO (APOYO - 10%):** "${textoCV.slice(0, 20000)}"
         *Instrucción:* Úsalo SOLO para rellenar datos duros que no estén en las notas (Nombre completo, Título universitario exacto, Ubicación, Nombres de empresas anteriores).
      `;
    }

    const prompt = `
      Actúa como un Consultor Senior de RRHH y Redactor de Informes Corporativos.
      Tu misión es transformar notas crudas (a veces vagas o desordenadas) en un INFORME EJECUTIVO ESTRUCTURADO Y PROFESIONAL.

      ${seccionFuentes}

      --- REGLAS DE PROCESAMIENTO INTELIGENTE ---
      - **Detección de Skills:** Si las notas dicen "dominio sólido en Python", agrégalo a Competencias Técnicas con nivel "Alto" o "Avanzado".
      - **Detección de Idiomas:** Si las notas dicen "Inglés C1" o "se desenvolvió natural", pon "Avanzado (C1)" en la ficha.
      - **Soft Skills:** Si las notas dicen "resolutivo" o "excelente comunicación", agrégalas a Habilidades Blandas con nivel "Alto".
      - **Niveles Numéricos (HERRAMIENTAS):** Si es 'Avanzado/Experto' usa 90-100%, 'Sólido/Intermedio' 70-80%, 'Básico' 30-40%.
      - **Plus:** Si las notas mencionan "punto fuerte" o ventajas logísticas (remoto, disponibilidad), ponlo en la sección Plus.
      - **Estilo:** Usa un lenguaje corporativo formal. Evita frases como "el candidato dijo", usa afirmaciones directas ("Posee un perfil...").

      --- FORMATO DE SALIDA (JSON) ---
      Responde SOLO con este JSON:
      {
        "nombre": "Nombre Completo",
        "puesto": "${puesto}",
        "resumen_ejecutivo": "Redacción profesional de 5-8 líneas integrando perfil, experiencia y las fortalezas mencionadas en las notas.",
        "ficha_tecnica": {
           "ubicacion": "Ciudad/País (del CV)",
           "nivel_experiencia": "Senior/Semi/Junior (deducido de notas o CV)",
           "formacion_formal": "Título Principal (del CV)",
           "nivel_ingles": "Nivel Validado (de las NOTAS, ej: C1 Avanzado)",
           "disponibilidad": "Dato de las NOTAS (ej: Inmediata)"
        },
        "competencias_tecnicas": [
            {"competencia": "Skill Técnica 1 (ej: Python)", "nivel": "Nivel deducido (ej: Alto)"},
            {"competencia": "Skill Técnica 2 (ej: Orquestación IA)", "nivel": "Nivel deducido (ej: Alto)"}
        ],
        "habilidades_blandas": [
            {"habilidad": "Soft Skill 1 (ej: Comunicación)", "nivel": "Alto"},
            {"habilidad": "Soft Skill 2 (ej: Resolutividad)", "nivel": "Alto"}
        ],
        "herramientas": [
    {"herramienta": "Software mencionado", "nivel": "Estimación 0-100% (ej: 85%)"}
],
        "plus": "Redacta aquí los 'Puntos fuertes' o ventajas logísticas de las notas (ej: Capacidad de traducción técnica-negocio).",
        "formacion_sugerida": "Si las notas mencionan gaps (ej: falta tal cosa), ponlo aquí. Si no, pon 'Ninguna requerida actualmente'.",
        "conclusion_final": "Veredicto profesional basado en el tono de las notas (ej: Perfil altamente recomendado por su solidez técnica y soft skills).",
        "responsable": "${responsable}"
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    
    // Limpieza extra por si Gemini mete texto antes del JSON
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
        text = text.substring(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(text);

  } catch (error) {
    console.error("❌ Error IA (Cerebro V3):", error);
    return { nombre: "Error al procesar", resumen_ejecutivo: "Hubo un error interpretando las notas. Intente ser más específico." };
  }
}

// --- RUTAS ---

// ====================================================================
// 📄 GENERADOR WORD V3 (MOTOR DE PLANTILLAS - EDICIÓN VISUAL)
// ====================================================================
app.post("/download-docx", async (req, res) => {
  try {
      const data = req.body;
      console.log("📝 Generando Word con plantilla para:", data.nombre);

      // 1. CARGAR LA PLANTILLA
      // Busca 'plantilla.docx' en la carpeta raíz
      const content = fs.readFileSync(path.resolve(__dirname, "plantilla.docx"), "binary");
      const zip = new PizZip(content);

      // 2. INICIALIZAR EL MOTOR
      const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
      });

      // 3. PREPARAR DATOS (Mapeo exacto a las etiquetas de tu Word)
      // La fecha se genera en el momento
      const fechaHoy = new Date().toLocaleDateString("es-ES", { year: 'numeric', month: 'long', day: 'numeric' });

      const payload = {
          fecha: fechaHoy,
          nombre: data.nombre || "Candidato",
          puesto: data.puesto || "-",
          
          // Resumen (con fallback por si viene con otro nombre)
          resumen_ejecutivo: data.resumen_ejecutivo || data.resumen_profesional || "",
          
          // Ficha Técnica (Manejo seguro de nulos)
          ubicacion: data.ficha_tecnica?.ubicacion || "-",
          experiencia: data.ficha_tecnica?.nivel_experiencia || "-",
          formacion: data.ficha_tecnica?.formacion_formal || data.ficha_tecnica?.formacion || "-",
          ingles: data.ficha_tecnica?.nivel_ingles || data.ficha_tecnica?.idiomas || "-",
          disponibilidad: data.ficha_tecnica?.disponibilidad || "-",

          // Tablas (Arrays para los bucles)
          // Si no hay datos, enviamos array vacío para que no rompa
          competencias_tecnicas: Array.isArray(data.competencias_tecnicas) ? data.competencias_tecnicas : [],
          habilidades_blandas: Array.isArray(data.habilidades_blandas) ? data.habilidades_blandas : [],
          herramientas: Array.isArray(data.herramientas) ? data.herramientas : [],

          // Secciones Finales
          plus: data.plus || "Sin información adicional.",
          formacion_sugerida: data.formacion_sugerida || "Ninguna específica.",
          conclusion_final: data.recomendacion_final || data.conclusion_final || "",
          responsable: data.responsable || "Admin"
      };

      // 4. RENDERIZAR DOCUMENTO
      doc.render(payload);

      // 5. GENERAR Y ENVIAR
      const buf = doc.getZip().generate({
          type: "nodebuffer",
          compression: "DEFLATE",
      });

      // Limpiamos el nombre del archivo para que no tenga caracteres raros
      const safeName = (data.nombre || "Candidato").replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      const filename = `Informe_${safeName}.docx`;
      
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.send(buf);

  } catch (e) {
      console.error("❌ Error generando Word con plantilla:", e);
      // Si hay error de etiquetas, mostramos cuál es para ayudar a depurar
      if (e.properties && e.properties.errors) {
           e.properties.errors.forEach(err => console.error(`   - ${err.message}`));
      }
      res.status(500).json({ error: "Error al generar el documento. Verifica que 'plantilla.docx' exista y las etiquetas coincidan." });
  }
});

// 3. Normalización de texto básica
function normalizeText(str) {
  return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// 4. Extracción simple de nombre (Fallback)
function extractNameFromBody(body, { knownEmail }) {
  // Intento muy básico si no viene de Zoho
  if (knownEmail) return knownEmail.split("@")[0].replace(/[._]/g, " ");
  return "Candidato Desconocido";
}

// 5. Placeholder para audio (para que no rompa si falta ffmpeg)
async function extractAudioMono16k(videoPath) {
    // Si no tenés ffmpeg instalado en Render, esto va a fallar.
    // Retornamos null para que el código siga sin transcripción.
    return null; 
}

// ==========================================
// 🎥 FUNCIONES DE ANÁLISIS DE VIDEO Y CV
// ==========================================

// Función para verificar si un link de video es público y accesible
async function verificarLinkVideoPublico(url) {
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });
    
    return {
      esPublico: response.status === 200,
      esVideo: (response.headers['content-type'] || '').includes('video')
    };
  } catch (error) {
    return {
      esPublico: false,
      esVideo: false
    };
  }
}

// Función para generar reseña del CV
async function generarResenaCV(textoCV, puesto) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    // Obtener fecha actual para contexto temporal
    const ahora = new Date();
    const añoActual = ahora.getFullYear();
    const mesActual = ahora.getMonth() + 1; // getMonth() retorna 0-11
    const fechaActualTexto = `${añoActual}-${String(mesActual).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    
    const prompt = `
    ACTÚA COMO: Auditor Senior de Talento para Global Talent Connections.
    OBJETIVO: Realizar una "Due Diligence" de CALIDAD y VERACIDAD del CV para el puesto de "${puesto}".
    
    ⏰ CONTEXTO TEMPORAL CRÍTICO:
    - FECHA ACTUAL: ${fechaActualTexto} (Año: ${añoActual}, Mes: ${mesActual})
    - IMPORTANTE: Las fechas de ${añoActual} NO son futuras, son fechas ACTUALES o PASADAS.
    - Al analizar fechas en el CV:
      * Fechas de ${añoActual}: Considerarlas como ACTUALES o PASADAS, nunca como futuras.
      * Fechas anteriores a ${añoActual}: Son PASADAS.
      * Solo considerar como FUTURAS fechas posteriores a ${añoActual} o fechas de ${añoActual + 1} en adelante.
    - NO penalizar por fechas de ${añoActual} interpretándolas como futuras.
    - Al calcular duración de empleos o gaps temporales, usar ${añoActual} como año de referencia actual.
    
    CV DEL CANDIDATO:
    ${textoCV.slice(0, 15000)}
    
    INSTRUCCIONES DE AUDITORÍA (APLICA ESTAS REGLAS ESTRICTAS):
    
    1. 📉 FILTRO "RELEVANCIA PURA" (Peso Máximo):
       - Ignora la "experiencia total". Calcula solo la "Experiencia Útil": años en roles idénticos o directamente transferibles al puesto.
       - Aplica DEVALUACIÓN INMEDIATA si la experiencia proviene de sectores operativos irrelevantes (Retail, Gastronomía, Atención presencial, roles administrativos genéricos sin especialización), etiquetándola como "Experiencia No Transferible".
    
    2. 🏆 REGLA DE "RESULTADOS vs. FUNCIONES":
       - Analiza la redacción: ¿Usa verbos de acción ("Lideré", "Aumenté", "Creé") y menciona métricas (KPIs, % de mejora)?
       - PENALIZA severamente los CVs que sean "Listas de Supermercado" (solo listan tareas: "Encargado de...", "Realización de..."). Esto indica perfil operativo, no orientado a resultados.
    
    3. 🚩 REGLA DE "ESTABILIDAD Y PROFUNDIDAD":
       - **Job Hopping**: Si el candidato tiene 4+ trabajos en menos de 5 años, o múltiples empleos de menos de 1 año de duración, PENALIZA fuertemente. Esto indica inestabilidad laboral o bajo desempeño.
       - **Descripciones Escuetas**: Si cada puesto tiene solo 2-3 líneas de descripción sin profundizar en responsabilidades, PENALIZA. Esto señala experiencia superficial o falta de impacto real en el rol.
       - **Gaps Temporales**: Si hay períodos de 6+ meses sin trabajar entre empleos sin explicación, márcalo como señal de alerta.
       - **Falta de Especialización**: Si los roles son muy variados y sin hilo conductor claro, indica falta de expertise consolidado en un área específica.
       - **Ocupación Actual**: Si el CV no especifica claramente si está trabajando actualmente o cuál es su situación laboral presente, menciónalo como falta de transparencia.
    
    4. 🎓 REGLA "ANTI-TITULITIS":
       - La formación académica y certificaciones son un plus, NO un reemplazo.
       - Si el candidato tiene muchos cursos/títulos pero poca experiencia práctica relevante, etiquétalo como "Perfil Teórico / Junior Académico". No permitas que los títulos inflen el seniority.
    
    5. 📝 ESTRUCTURA Y SÍNTESIS:
       - Evalúa la capacidad de comunicación del CV. Si es confuso, desordenado o contiene información de relleno ("exageraciones"), márcalo como una deficiencia en "Habilidades de Comunicación Escrita".

    6. UBICACIÓN GEOGRÁFICA (SOLO LATAM): Solo se aceptan candidatos que residan en Latinoamérica.
         - Países LATAM válidos: México, Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Panamá, Colombia, Venezuela, Ecuador, Perú, Bolivia, Chile, Argentina, Uruguay, Paraguay, Brasil, Cuba, República Dominicana, Puerto Rico.
         - Si el CV indica residencia en España, Estados Unidos, Europa, Asia, África, Oceanía o cualquier región NO latinoamericana:
         -> ACCIÓN: Score máximo 35. Flag OBLIGATORIA: "Fuera de LATAM".
         - Si NO se puede determinar la ubicación del candidato desde el CV: NO penalizar, continuar evaluación normal.
    
    CALIBRACIÓN DE SEVERIDAD (usa esto como guía interna para el tono):
    
    PERFIL BAJO (30-40): 
    - Job hopping evidente (4+ trabajos en <5 años)
    - Descripciones ultra escuetas sin profundidad
    - Cero logros medibles o KPIs
    - Roles dispersos sin especialización
    - Gaps temporales sin explicar
    → Tono: Muy crítico, múltiples señales de alerta
    
    PERFIL MEDIO-BAJO (50-60):
    - Experiencia útil limitada (1-2 años reales para el rol)
    - Algunos logros pero sin métricas concretas
    - Estabilidad laboral aceptable
    - CV con estructura básica pero sin destacarse
    → Tono: Crítico moderado, cumple mínimos
    
    PERFIL SÓLIDO (70+):
    - Experiencia útil consolidada (5+ años relevantes)
    - Logros medibles con KPIs y resultados demostrables
    - Estabilidad laboral clara
    - Especialización en el área del puesto
    → Tono: Positivo pero objetivo
    
    FORMATO DE SALIDA (Reseña de Auditoría):
    Redacta un párrafo de 3-5 líneas con tono analítico, DURO y objetivo.
    Céntrate en la discrepancia entre lo que el candidato "cree que vale" y lo que "realmente demuestra" según estos estándares.
    SÉ ESPECIALMENTE SEVERO con CVs que acumulen múltiples señales de alerta (job hopping + descripciones escuetas + falta de logros).
    
    Ejemplos de tono según categoría:
    
    [PERFIL BAJO - 30-40]
    "Perfil con señales críticas de inestabilidad laboral: múltiples empleos de corta duración en los últimos años, sugiriendo bajo desempeño o falta de compromiso. Las descripciones de cada rol son extremadamente escuetas sin un solo logro medible, evidenciando experiencia superficial tipo 'lista de supermercado'. La trayectoria carece de especialización clara, saltando entre roles dispersos sin consolidar expertise en ningún área. No especifica ocupación actual. Perfil de entrada con múltiples banderas rojas que requiere validación exhaustiva."
    
    [PERFIL MEDIO-BAJO - 50-60]
    "Perfil con experiencia mixta. Aunque presenta trayectoria laboral de varios años, solo una fracción es directamente transferible al rol remoto solicitado. El CV muestra estabilidad moderada pero carece de logros medibles o KPIs que demuestren impacto real. Las descripciones se mantienen en el nivel funcional sin evidenciar orientación a resultados. Cumple requisitos mínimos pero sin elementos diferenciadores."
    
    [PERFIL SÓLIDO - 70+]
    "Perfil con experiencia relevante consolidada en el área. Demuestra progresión clara con permanencia estable en roles similares al puesto objetivo. El CV evidencia orientación a resultados con logros específicos y métricas cuantificables. La especialización es clara y las habilidades técnicas están respaldadas por aplicación práctica demostrable."
    `;
    
    const result = await model.generateContent(prompt);
    const reseña = result.response.text().trim();
    
    return reseña;
  } catch (error) {
    console.error("❌ Error generando reseña del CV:", error.message);
    return "Error al generar reseña del CV. Revisar manualmente.";
  }
}

// ==========================================
// 🎥 HELPER: DESCARGAR VIDEO DE GOOGLE DRIVE
// ==========================================
/**
 * Convierte un link de Google Drive a formato de descarga directa
 * @param {string} driveUrl - URL de Google Drive
 * @returns {string} URL de descarga directa
 */
function convertirLinkDriveADescarga(driveUrl) {
  // Si ya es un link de descarga, retornarlo tal cual
  if (driveUrl.includes('/uc?export=download')) {
    return driveUrl;
  }
  
  // Si es un link de visualización (/file/d/), extraer el ID y convertir
  if (driveUrl.includes('/file/d/')) {
    const fileIdMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
  }
  
  // Si es un link compartido (/open?id=), extraer el ID
  if (driveUrl.includes('/open?id=')) {
    const fileIdMatch = driveUrl.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
  }
  
  // Si no se puede convertir, retornar el original
  return driveUrl;
}

// ==========================================
// 🎥 HELPER: COMPRIMIR VIDEO A MÁXIMO 50MB
// ==========================================
/**
 * Comprime un video a máximo 50MB usando ffmpeg
 * @param {string} inputPath - Ruta del video original
 * @param {string} outputPath - Ruta donde guardar el video comprimido
 * @returns {Promise<{success: boolean, sizeMB: number, error: string|null}>}
 */
function comprimirVideoA50MB(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Primero obtener la duración del video para calcular el bitrate
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        return reject(new Error(`Error obteniendo metadata del video: ${err.message}`));
      }
      
      const duracionSegundos = metadata.format.duration || 60; // Fallback a 60 segundos
      const tamañoMaximoBytes = 50 * 1024 * 1024; // 50MB en bytes
      const tamañoMaximoBits = tamañoMaximoBytes * 8; // Convertir a bits
      
      // Calcular bitrate objetivo (dejando espacio para audio ~128kbps)
      const bitrateVideoKbps = Math.max(500, Math.floor((tamañoMaximoBits / duracionSegundos - 128000) / 1000));
      
      console.log(`📊 [COMPRESIÓN] Duración: ${duracionSegundos.toFixed(2)}s, Bitrate objetivo: ${bitrateVideoKbps}kbps`);
      
      // Comprimir el video
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(`${bitrateVideoKbps}k`)
        .audioBitrate('128k')
        .outputOptions([
          '-preset medium',
          '-crf 23', // Calidad balanceada
          '-movflags +faststart' // Para streaming web
        ])
        .on('start', (commandLine) => {
          console.log(`🎬 [COMPRESIÓN] Iniciando: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`📊 [COMPRESIÓN] Progreso: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          // Verificar tamaño final
          const stats = fs.statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          console.log(`✅ [COMPRESIÓN] Completado. Tamaño final: ${sizeMB.toFixed(2)}MB`);
          
          resolve({
            success: true,
            sizeMB: sizeMB,
            error: null
          });
        })
        .on('error', (err) => {
          console.error(`❌ [COMPRESIÓN] Error: ${err.message}`);
          reject(new Error(`Error comprimiendo video: ${err.message}`));
        })
        .save(outputPath);
    });
  });
}

// ==========================================
// 📥 HELPER: PROCESAR ARCHIVO DESDE LINK (WorkDrive, Loom, YouTube, Drive)
// ==========================================
/**
 * Descarga archivos desde links privados (WorkDrive) y los sube a Firebase Storage,
 * o retorna links públicos directamente (Loom, YouTube, Google Drive).
 * Para Google Drive, descarga, comprime a máximo 50MB y sube a Storage.
 * 
 * @param {string} url - URL del archivo (WorkDrive, Loom, YouTube, Drive, etc.)
 * @param {string} tipo - Tipo de archivo: 'cv' o 'video'
 * @param {string} safeId - ID seguro del candidato para nombrar el archivo
 * @returns {Promise<{urlPublica: string, procesado: boolean, error: string|null}>}
 */
async function procesarArchivoDesdeLink(url, tipo, safeId) {
  // Validación básica
  if (!url || !url.startsWith('http')) {
    return { urlPublica: url || "", procesado: false, error: null };
  }

  try {
    // Detectar tipo de link
    const esWorkDrive = url.includes('workdrive.zoho') || url.includes('drive.zoho');
    const esLoom = url.includes('loom.com');
    const esYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const esGoogleDrive = url.includes('drive.google.com');
    
    // 🎥 PROCESAMIENTO ESPECIAL PARA GOOGLE DRIVE (solo videos)
    if (esGoogleDrive && tipo === 'video') {
      console.log(`🎥 Procesando video de Google Drive: descargando, comprimiendo y subiendo...`);
      
      try {
        // 1. Convertir link de Drive a formato de descarga
        const downloadUrl = convertirLinkDriveADescarga(url);
        console.log(`📥 Descargando desde: ${downloadUrl.substring(0, 80)}...`);
        
        // 2. Descargar el video (límite alto, lo comprimiremos después)
        const response = await axios.get(downloadUrl, {
          responseType: 'arraybuffer',
          timeout: 300000, // 5 minutos timeout (videos grandes pueden tardar)
          maxContentLength: 500 * 1024 * 1024, // 500MB máximo para descarga (luego comprimimos a 50MB)
          maxRedirects: 10, // Seguir redirects de Google Drive
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
          },
          validateStatus: function (status) {
            return status >= 200 && status < 400; // Aceptar redirects
          }
        });
        
        // 🔥 VALIDAR que realmente descargamos un video, no HTML
        const contentType = response.headers['content-type'] || '';
        const responseStart = Buffer.from(response.data.slice(0, Math.min(1000, response.data.length))).toString('utf-8');
        const isHTML = contentType.includes('text/html') || 
                       responseStart.includes('<!DOCTYPE') ||
                       responseStart.includes('<html') ||
                       responseStart.includes('Google Drive');
        
        if (isHTML) {
          throw new Error('Google Drive devolvió HTML en lugar del video. El archivo puede ser muy grande o requiere permisos especiales. Verifica que el link sea público y accesible.');
        }
        
        // Validar que el tamaño sea razonable (mínimo 1KB)
        if (response.data.length < 1024) {
          throw new Error(`Video descargado es demasiado pequeño (${response.data.length} bytes). Posible error en la descarga.`);
        }
        
        // 3. Guardar temporalmente el video descargado
        const tempInputPath = path.join(os.tmpdir(), `${safeId}_video_original_${Date.now()}.mp4`);
        const tempOutputPath = path.join(os.tmpdir(), `${safeId}_video_comprimido_${Date.now()}.mp4`);
        
        fs.writeFileSync(tempInputPath, Buffer.from(response.data));
        const sizeOriginalMB = response.data.length / (1024 * 1024);
        console.log(`📊 Video descargado: ${sizeOriginalMB.toFixed(2)}MB`);
        
        // 4. Comprimir el video a máximo 50MB
        let videoBuffer;
        if (sizeOriginalMB > 50) {
          console.log(`🎬 Comprimiendo video de ${sizeOriginalMB.toFixed(2)}MB a máximo 50MB...`);
          await comprimirVideoA50MB(tempInputPath, tempOutputPath);
          videoBuffer = fs.readFileSync(tempOutputPath);
          
          // Limpiar archivos temporales
          try { fs.unlinkSync(tempInputPath); } catch(e) {}
          try { fs.unlinkSync(tempOutputPath); } catch(e) {}
        } else {
          console.log(`✅ Video ya está bajo 50MB, no necesita compresión`);
          videoBuffer = Buffer.from(response.data);
          // Limpiar archivo temporal
          try { fs.unlinkSync(tempInputPath); } catch(e) {}
        }
        
        // 5. Subir a Firebase Storage
        const fileName = `CVs_staging/videos/${safeId}_video.mp4`;
        const bucketFile = bucket.file(fileName);
        
        await bucketFile.save(videoBuffer, { 
          metadata: { contentType: 'video/mp4' } 
        });
        
        // 6. Generar link público firmado
        const [publicUrl] = await bucketFile.getSignedUrl({
          action: 'read',
          expires: '01-01-2035',
          responseDisposition: 'inline'
        });
        
        const sizeFinalMB = videoBuffer.length / (1024 * 1024);
        console.log(`✅ Video de Google Drive procesado y comprimido: ${sizeFinalMB.toFixed(2)}MB → ${fileName}`);
        
        return { urlPublica: publicUrl, procesado: true, error: null };
        
      } catch (error) {
        console.error(`❌ Error procesando video de Google Drive:`, error.message);
        // Si falla, retornar el link original como fallback
        return {
          urlPublica: url,
          procesado: false,
          error: `Error procesando video de Drive: ${error.message}`
        };
      }
    }
    
    // Si es un link público conocido (Loom, YouTube) o Drive pero es CV, guardarlo directamente
    if (esLoom || esYouTube || (esGoogleDrive && tipo === 'cv')) {
      console.log(`✅ Link ${tipo} es público (${esLoom ? 'Loom' : esYouTube ? 'YouTube' : 'Google Drive'}), guardando directamente.`);
      return { urlPublica: url, procesado: false, error: null };
    }
    
    // Si es WorkDrive o link externo desconocido, descargar y subir a Storage
    if (esWorkDrive || (!esLoom && !esYouTube && !esGoogleDrive)) {
      console.log(`📥 Descargando ${tipo} desde ${esWorkDrive ? 'WorkDrive' : 'link externo'}...`);
      
      // Configurar según el tipo de archivo
      let extension, contentType, carpeta;
      if (tipo === 'cv') {
        extension = 'pdf';
        contentType = 'application/pdf';
        carpeta = 'files';
      } else {
        extension = 'mp4';
        contentType = 'video/mp4';
        carpeta = 'videos';
      }
      
      // Descargar el archivo
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: tipo === 'video' ? 300000 : 60000, // 5 minutos para videos, 60 seg para CVs
        maxContentLength: tipo === 'cv' ? 10 * 1024 * 1024 : 500 * 1024 * 1024, // 10MB para CV, 500MB para video
        maxRedirects: 10,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
        }
      });
      
      // Subir a Firebase Storage
      const fileName = `CVs_staging/${carpeta}/${safeId}_${tipo}.${extension}`;
      const bucketFile = bucket.file(fileName);
      
      await bucketFile.save(Buffer.from(response.data), { 
        metadata: { contentType } 
      });
      
      // Generar link público firmado (válido hasta 2035)
      const [publicUrl] = await bucketFile.getSignedUrl({
        action: 'read',
        expires: '01-01-2035',
        responseDisposition: tipo === 'cv' ? 'inline' : 'inline' // Abrir en navegador, no descargar
      });
      
      console.log(`✅ ${tipo.toUpperCase()} descargado y subido a Storage: ${fileName}`);
      return { urlPublica: publicUrl, procesado: true, error: null };
    }
    
    // Fallback: retornar el link original si no se procesó
    return { urlPublica: url, procesado: false, error: null };
    
  } catch (error) {
    console.error(`❌ Error procesando ${tipo} desde link:`, error.message);
    return {
      urlPublica: url, // Mantener el link original aunque falle
      procesado: false,
      error: `No se pudo descargar desde ${url}: ${error.message}`
    };
  }
}

// ==========================================
// 🧠 CEREBRO IA: CLASIFICADOR VIVIANA/GLADYMAR (FINAL CON FLAGS)
// ==========================================
async function verificaConocimientosMinimos(puesto, textoCandidato, declaraciones = "", reseñaCV = null, reseñaVideo = null) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

    // Obtener fecha actual para contexto temporal
    const ahora = new Date();
    const añoActual = ahora.getFullYear();
    const mesActual = ahora.getMonth() + 1;
    const fechaActualTexto = `${añoActual}-${String(mesActual).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

    // Construir el prompt con las reseñas si están disponibles
    let fuentesInfo = `[DATOS TÉCNICOS Y RESPUESTAS DEL FORMULARIO]:\n${textoCandidato.slice(0, 15000)}`;
    
    if (reseñaCV) {
      fuentesInfo += `\n\n[RESEÑA DEL CV (Análisis Profesional)]:\n${reseñaCV}`;
    }
    
    if (reseñaVideo) {
      fuentesInfo += `\n\n[RESEÑA DEL VIDEO DE PRESENTACIÓN (Análisis Profesional)]:\n${reseñaVideo}`;
    }

    const prompt = `
      ACTÚA COMO: Reclutador Senior de Global Talent Connections (Criterio Unificado).
      TU OBJETIVO: Evaluar a este candidato para el puesto de "${puesto}" y asignar Score + Alertas.
      
      ⏰ CONTEXTO TEMPORAL CRÍTICO:
      - FECHA ACTUAL: ${fechaActualTexto} (Año: ${añoActual}, Mes: ${mesActual})
      - IMPORTANTE: Las fechas de ${añoActual} NO son futuras, son fechas ACTUALES o PASADAS.
      - Al evaluar experiencia y seniority:
        * Fechas de ${añoActual}: Considerarlas como ACTUALES o PASADAS, nunca como futuras.
        * Fechas anteriores a ${añoActual}: Son PASADAS.
        * Solo considerar como FUTURAS fechas posteriores a ${añoActual} o fechas de ${añoActual + 1} en adelante.
      - NO penalizar por fechas de ${añoActual} interpretándolas como futuras.
      - Al calcular años de experiencia, usar ${añoActual} como año de referencia actual.
      
      === FUENTES DE INFORMACIÓN ===
      ${fuentesInfo}

      === 🛑 REGLAS DE ORO (FILTROS DE MUERTE SÚBITA) ===
      Si detectas estos casos, el Score debe ser < 40 y DEBES AGREGAR LA ALERTA (Flag) correspondiente:
      
      1. RECHAZO DE SALARIO: Pide más del presupuesto o dice "no".
         -> ACCIÓN: Score 0. Flag OBLIGATORIA: "Rechazo Salario".
      2. RECHAZO DE MONITOREO: Se niega a usar Time Doctor/Trackers.
         -> ACCIÓN: Score 0. Flag OBLIGATORIA: "Rechazo Monitoreo".
      3. DISPONIBILIDAD: No tiene disponibilidad inmediata o full-time.
         -> ACCIÓN: Score 0. Flag OBLIGATORIA: "Sin Disponibilidad".
      4. DOBLE EMPLEO (Criterio Gladymar): Indica que mantendrá otro trabajo.
         -> ACCIÓN: Score 40-50. Flag OBLIGATORIA: "Doble Empleo".
      5. ACTITUD: Respuestas arrogantes o agresivas.
         -> ACCIÓN: Score < 50. Flag OBLIGATORIA: "Mala Actitud".
      

      === 📋 CRITERIOS DE PERFIL (PONDERACIÓN) ===
      Evalúa estos factores y combínalos para el score final (0-100):
      
      > SENIORITY (Peso: 20%):
        - Junior (1-2 años): Score base 50-60
        - Semi-Senior (2-5 años): Score base 60-75
        - Senior (+5 años): Score base 70-85
      
      > EXPERIENCIA ESPECÍFICA (Peso: 35% - MÁS IMPORTANTE):
        - Automatización: Experiencia REAL en Make/Zapier/Power Automate (proyectos concretos, workflows reales, no solo "conozco").
        - Dev Web: Stack moderno (React/Vue/Next.js) + Portafolio demostrable con proyectos reales.
        - Marketing Digital: Campañas reales con resultados (Meta Ads, Google Ads, Analytics con métricas), no solo "manejo redes".
        - Diseño Gráfico: Portfolio con trabajos reales, dominio de herramientas (Figma, Adobe Suite), proyectos para clientes.
        - RRHH: Experiencia en reclutamiento, selección, gestión de personal, conocimiento de ATS/CRM.
        - Ventas: Experiencia con CRM (HubSpot, Salesforce), métricas de ventas, manejo de pipeline.
        - Contabilidad: Experiencia con software contable, manejo de estados financieros, certificaciones relevantes.
        - Otros roles: Ajusta según el puesto "${puesto}" - busca experiencia CONCRETA y DEMOSTRABLE.
      
      > HERRAMIENTAS Y TECNOLOGÍAS (Peso: 25%):
        - Herramientas mencionadas en el puesto: +10 si domina, +5 si conoce básicamente.
        - Stack completo vs parcial: Ajusta según relevancia para el rol.
        - Certificaciones relevantes: Considera como bonus si son oficiales y actualizadas.
      
      > COMUNICACIÓN Y PRESENTACIÓN (Peso: 20%):
        - Video: Claridad, profesionalismo, estructura del mensaje, coherencia.
        - CV: Organización, detalle, coherencia entre experiencia y habilidades.
        - Formulario: Completitud, calidad de respuestas, atención al detalle.

      === 🎯 GUÍA DE SCORING FINAL ===
      - 0-40: Filtros de muerte súbita activos O perfil muy bajo (falta experiencia base, sin herramientas clave).
      - 41-60: Perfil básico - Cumple requisitos mínimos pero con gaps importantes (herramientas parciales, experiencia limitada).
      - 61-75: Perfil sólido - Cumple requisitos principales del puesto, experiencia adecuada, herramientas necesarias.
      - 76-85: Perfil destacado - Supera expectativas, experiencia relevante sólida, dominio de herramientas clave.
      - 86-100: Perfil excepcional - Experiencia excepcional, dominio completo de stack, resultados demostrables.
      
      NOTA: Un candidato puede tener score alto (75+) pero activar filtros de muerte súbita → Score final = 0-40.

      === 🔄 PROCESO DE EVALUACIÓN ===
      1. PRIMERO: Verifica filtros de muerte súbita → Si hay, Score = 0-40 y termina.
      2. SEGUNDO: Evalúa Seniority → Asigna score base según años.
      3. TERCERO: Evalúa Experiencia Específica → Ajusta score según relevancia y profundidad.
      4. CUARTO: Evalúa Herramientas → Ajusta según dominio y completitud del stack.
      5. QUINTO: Evalúa Comunicación → Ajusta según calidad de presentación.
      6. FINAL: Combina factores según ponderación y aplica rango final.

      === 🧮 SALIDA JSON EXACTA ===
      Responde SOLO con este JSON:
      {
        "score": (0-100),
        "pasa": (true si score >= 70),
        "motivos": "Justificación concisa del score (2-3 líneas máximo). Debe explicar brevemente: fortalezas principales, experiencia relevante, y por qué ese score específico. Sin redundancias.",
        "alertas": ["Array", "de", "Strings", "con", "las", "Flags", "detectadas"]
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    
    // Limpieza de JSON por si la IA agrega texto extra
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
        text = text.substring(firstBrace, lastBrace + 1);
    }

    const jsonFinal = JSON.parse(text);
    
    // Aseguramos que 'alertas' siempre sea un array (por seguridad del frontend)
    if (!Array.isArray(jsonFinal.alertas)) jsonFinal.alertas = [];

    return jsonFinal;

  } catch (e) {
    console.error("❌ Error en verificaConocimientosMinimos:", e.message);
    return { score: 50, pasa: false, motivos: "Error de análisis IA. Revisar manual.", alertas: ["Error IA"] };
  }
}
// ==========================================
// 📨 WEBHOOK ZOHO: CREACIÓN BLINDADA (ANTI-CRASH + VIDEO)
// ==========================================
app.post("/webhook/zoho", upload.none(), async (req, res) => {
  try {
    console.log("📨 [Webhook] Datos recibidos de Zoho.");
    await registrarEstadoWebhook("zoho_form1", true); // Registro de ejecución exitosa
    
    // 1. Detección Inteligente del Payload (Por si llega encapsulado)
    let data = req.body;
    if (data.payload) {
        try { data = JSON.parse(data.payload); } catch(e) {}
    } else if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) {}
    }
    
    // 🔍 LOG PARA DEBUG: Ver todos los campos relacionados con video
    const camposVideo = Object.keys(data).filter(k => 
        k.toLowerCase().includes('video') || 
        k.toLowerCase().includes('file') ||
        k.toLowerCase().includes('attachment')
    );
    if (camposVideo.length > 0) {
        console.log("🎥 Campos relacionados con video encontrados:", camposVideo);
        camposVideo.forEach(campo => {
            console.log(`   ${campo}:`, typeof data[campo] === 'object' ? JSON.stringify(data[campo]).substring(0, 100) : data[campo]);
        });
    }

    // 2. SANITIZACIÓN ID
    const emailRaw = (data.Email || "").trim().toLowerCase();
    if (!emailRaw) return res.status(400).send("Falta Email");
    
    // ID ÚNICO
    const safeId = emailRaw.replace(/[^a-z0-9]/g, "_");

    // 3. FECHA EXACTA
    const nowISO = new Date().toISOString();

    // 4. OBJETO BASE (CON SEGURIDAD ANTI-CRASH || "")
    
    // 🔥 DETECCIÓN INTELIGENTE DE VIDEO
    // Zoho puede enviar video de dos formas:
    // 1. Link directo (Video_Link): "https://drive.google.com/..."
    // 2. Archivo subido: Puede venir como Video_File, Video_Attachment, Video_URL, etc.
    let videoUrl = "";
    let videoTipo = "ninguno"; // "link" | "archivo" | "ninguno"
    
    // Prioridad 1: Link directo (campo Video_Link)
    if (data.Video_Link && data.Video_Link.trim() && data.Video_Link.startsWith('http')) {
      videoUrl = data.Video_Link.trim();
      videoTipo = "link";
    }
    // Prioridad 2: Otros campos posibles de Zoho para video subido
    else if (data.Video_File || data.Video_Attachment || data.Video_URL || data.Video) {
      // Si es un link de Zoho para descargar el archivo
      const videoField = data.Video_File || data.Video_Attachment || data.Video_URL || data.Video;
      if (typeof videoField === 'string' && videoField.startsWith('http')) {
        videoUrl = videoField;
        videoTipo = "archivo";
      } else if (typeof videoField === 'object' && videoField.url) {
        videoUrl = videoField.url;
        videoTipo = "archivo";
      } else {
        // Si es un objeto con más info, guardamos la info completa para procesar después
        videoUrl = JSON.stringify(videoField);
        videoTipo = "archivo";
      }
    }
    
    // Log para debugging
    if (videoUrl) {
      console.log(`🎥 Video detectado (${videoTipo}): ${videoUrl.substring(0, 50)}...`);
    }
    
    // 🔥 DETECCIÓN INTELIGENTE DE CV
    // Zoho puede enviar CV de dos formas:
    // 1. Link directo (CV_Link, Curriculum_Link, PDF_Link): "https://workdrive.zoho.eu/..."
    // 2. Archivo subido: Puede venir como CV_File, CV_Attachment, PDF_File, etc.
    let cvUrl = "";
    let cvTipo = "ninguno"; // "link" | "archivo" | "ninguno"
    
    // Buscar en múltiples campos posibles (CV_Link, Curriculum_Link, PDF_Link, CV_File, etc.)
    const camposCV = Object.keys(data).filter(k => 
      (k.toLowerCase().includes('cv') || 
       k.toLowerCase().includes('curriculum') || 
       k.toLowerCase().includes('pdf')) &&
      (k.toLowerCase().includes('link') || 
       k.toLowerCase().includes('file') || 
       k.toLowerCase().includes('url') ||
       k.toLowerCase().includes('attachment'))
    );
    
    if (camposCV.length > 0) {
      console.log(`📄 Campos relacionados con CV encontrados:`, camposCV);
      const cvField = data[camposCV[0]];
      if (typeof cvField === 'string' && cvField.startsWith('http')) {
        cvUrl = cvField.trim();
        cvTipo = "link";
      } else if (typeof cvField === 'object' && cvField.url) {
        cvUrl = cvField.url;
        cvTipo = "archivo";
      } else if (Array.isArray(cvField) && cvField.length > 0) {
        // Si viene como array (ej: ["filename.pdf"]), tomar el primer elemento
        cvUrl = typeof cvField[0] === 'string' ? cvField[0] : (cvField[0]?.url || "");
        cvTipo = "archivo";
      }
    }
    
    // Log para debugging
    if (cvUrl) {
      console.log(`📄 CV detectado (${cvTipo}): ${cvUrl.substring(0, 50)}...`);
    }
    
    // ===== PROCESAR ARCHIVOS (Descargar desde WorkDrive si es necesario) =====
    let videoUrlFinal = videoUrl;
    let cvUrlFinal = cvUrl;
    let tienePdf = false;
    
    // Procesar video si existe
    if (videoUrl) {
      console.log(`🎥 Procesando video desde link...`);
      const resultadoVideo = await procesarArchivoDesdeLink(videoUrl, 'video', safeId);
      videoUrlFinal = resultadoVideo.urlPublica;
      if (resultadoVideo.error) {
        console.warn(`⚠️ Error procesando video: ${resultadoVideo.error}`);
      } else if (resultadoVideo.procesado) {
        console.log(`✅ Video procesado y subido a Storage`);
      }
    }
    
    // Procesar CV si existe
    if (cvUrl) {
      console.log(`📄 Procesando CV desde link...`);
      const resultadoCV = await procesarArchivoDesdeLink(cvUrl, 'cv', safeId);
      cvUrlFinal = resultadoCV.urlPublica;
      tienePdf = resultadoCV.procesado; // Solo marcamos como tiene_pdf si se procesó correctamente
      if (resultadoCV.error) {
        console.warn(`⚠️ Error procesando CV: ${resultadoCV.error}`);
      } else if (resultadoCV.procesado) {
        console.log(`✅ CV procesado y subido a Storage`);
      }
    }
    
    const candidato = {
      id: safeId,
      nombre: `${data.Nombre_Completo || ""} ${data.Apellido || ""}`.trim(),
      email: emailRaw,
      telefono: data.Telefono || "",
      puesto: data.Puesto_Solicitado || "General",
      
      // Video Link (URL pública si se procesó desde WorkDrive, o link original si es Loom/YouTube)
      video_url: videoUrlFinal,
      video_tipo: videoTipo, // Guardamos el tipo para referencia 
      
      respuestas_filtro: {
        // Aquí aplicamos la seguridad para que no explote Firestore si falta algo
        salario: data.Acepta_Salario || "",
        monitoreo: data.Acepta_Monitoreo || "",
        disponibilidad: data.Disponibilidad || "",
        herramientas: data.Top_Herramientas || "",
        logro_destacado: data.Logro_Destacado || ""
      },

      // ESTADO INICIAL
      ia_score: 0,
      ia_status: tienePdf ? "waiting_analysis" : "waiting_cv", 
      ia_motivos: tienePdf ? "CV recibido, pendiente de análisis." : "Esperando recepción de CV para análisis completo.",
      
      cv_url: cvUrlFinal, 
      tiene_pdf: tienePdf,
      
      // ETIQUETAS DE ESTADO
      stage: 'stage_1',           
      status_interno: 'new',      
      
      creado_en: admin.firestore.FieldValue.serverTimestamp(),
      origen: "webhook_zoho_passive",

      // HISTORIAL INICIAL
      historial_movimientos: [
        {
            date: nowISO,
            event: 'Ingreso por Zoho',
            detail: 'Candidato recibido desde formulario web (Zoho Form 1)',
            usuario: 'Sistema (Zoho)'
        }
      ]
    };

    // 5. GUARDAR EN FIRESTORE
    await firestore.collection("CVs_staging").doc(safeId).set(candidato, { merge: true });

    console.log(`✅ [Webhook] Candidato ${safeId} guardado correctamente.`);
    await registrarEstadoWebhook("zoho_form1", true); // Confirmación final de éxito
    res.status(200).send("OK");

  } catch (error) {
    console.error("❌ Error Webhook:", error);
    await registrarEstadoWebhook("zoho_form1", false, error.message); // Registro de error
    res.status(500).send("Error interno: " + error.message);
  }
});
// ==========================================
// 📊 HELPER: REGISTRAR ESTADO DE WEBHOOK
// ==========================================
async function registrarEstadoWebhook(webhookName, exito, error = null) {
  try {
    const ahora = new Date().toISOString();
    const estadoDoc = {
      webhook: webhookName, // "zoho_form1" o "zoho_form2"
      ultima_ejecucion: ahora,
      exito: exito,
      error: error || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Guardamos en una colección separada para no mezclar con candidatos
    await firestore.collection("webhook_status").doc(webhookName).set(estadoDoc, { merge: true });
    
    // También guardamos en un historial para tener registro de errores recientes
    if (!exito) {
      await firestore.collection("webhook_status").doc(webhookName)
        .collection("errores_recientes").add({
          fecha: ahora,
          error: error,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }
  } catch (e) {
    console.error(`Error guardando estado de ${webhookName}:`, e);
  }
}
// ==========================================================================
// 📥 ENDPOINT: ANALIZAR CV (Solo extrae nombre/email, NO guarda)
// ==========================================================================
app.post("/candidatos/analizar-cv", upload.single('cv'), async (req, res) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.js:3352',message:'Endpoint /candidatos/analizar-cv recibió request',data:{method:req.method,hasFile:!!req.file,headers:Object.keys(req.headers)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    console.log("🔍 Iniciando análisis de CV (solo extracción)...");
    
    // 1. Validaciones Iniciales
    if (!req.file) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.js:3358',message:'Validación falló: falta archivo',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return res.status(400).json({ error: "Falta el archivo PDF" });
    }
    
    // 2. Leer archivo temporal
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(req.file.path);
    
    // 3. Extraer Texto del PDF
    const pdfData = await pdfParse(fileBuffer);
    const textoCV = pdfData.text.slice(0, 20000);
    
    // 4. Extraer nombre y email con IA
    console.log("🤖 Extrayendo nombre y email del CV con IA...");
    const datosExtraidos = await extraerNombreYEmailDelCV(textoCV);
    
    // Limpieza del archivo temporal local
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    
    console.log(`✅ Análisis completado: ${datosExtraidos.nombre || 'Sin nombre'} - ${datosExtraidos.email || 'Sin email'}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.js:3375',message:'Enviando respuesta JSON exitosa',data:{nombre:datosExtraidos.nombre,email:datosExtraidos.email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    res.json({ 
      ok: true, 
      nombre: datosExtraidos.nombre || "",
      email: datosExtraidos.email || ""
    });
    
  } catch (error) {
    console.error("❌ Error en análisis de CV:", error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.js:3382',message:'Error capturado en catch',data:{error:error.message,stack:error.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================================
// 📥 NUEVA FUNCIÓN: CARGA MANUAL CON CLASIFICACIÓN (Persistente)
// ==========================================================================
// Reutilizamos 'upload' que ya tienes configurado con Multer (Fuente 118)

app.post("/candidatos/ingreso-manual", upload.single('cv'), async (req, res) => {
  try {
      console.log("⚡ Iniciando carga manual persistente...");
      
      // 1. Validaciones Iniciales
      if (!req.file) return res.status(400).json({ error: "Falta el archivo PDF" });
      const { email, nombre, puesto, salario, monitoreo, disponibilidad, herramientas, logro_destacado, competencias_tecnicas, habilidades_blandas } = req.body; // Datos que vienen del formulario manual
      
      // Generamos un ID seguro igual que en el correo (Fuente 74)
      const emailSafe = (email || "manual_no_email").trim().toLowerCase();
      const safeId = emailSafe.replace(/[^a-z0-9]/g, "_") + "_" + Date.now().toString().slice(-4);
      
      console.log(`📂 Procesando ingreso manual para ID: ${safeId}`);

      // 2. Subir a Google Cloud Storage (Igual que Fuente 75)
      // Esto permite que el "Analista Profundo" pueda leer el archivo después.
      const destFileName = `CVs_staging/files/${safeId}_CV.pdf`;
      const bucketFile = bucket.file(destFileName);
      
      // Leemos el archivo desde la ruta temporal de Multer
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(req.file.path);
      
      await bucketFile.save(fileBuffer, { metadata: { contentType: "application/pdf" } });
      
      // Generamos URL firmada para el dashboard
      const [publicCvUrl] = await bucketFile.getSignedUrl({ action: 'read', expires: '01-01-2035' });

      // 3. Extraer Texto para la IA (Igual que Fuente 76)
      const pdfData = await pdfParse(fileBuffer);
      const textoCV = pdfData.text.slice(0, 20000); // Límite de caracteres

      // 3.5. NO generar reseña ni análisis automático - se hará manualmente cuando el reclutador presione "Analizar"
      // Para carga manual, solo extraemos nombre y email automáticamente

      // 3.6. Si nombre o email no vienen del formulario, extraerlos con IA
      let nombreFinal = nombre;
      let emailFinal = email;
      
      if (!nombre || !email) {
        console.log("🤖 Extrayendo nombre y email del CV con IA...");
        const datosExtraidos = await extraerNombreYEmailDelCV(textoCV);
        
        // Solo usar datos de IA si no vinieron del formulario
        if (!nombreFinal && datosExtraidos.nombre) {
          nombreFinal = datosExtraidos.nombre;
        }
        if (!emailFinal && datosExtraidos.email) {
          emailFinal = datosExtraidos.email;
        }
      }
      
      // Actualizar emailSafe con el email final (ya sea del formulario o de IA)
      const emailSafeFinal = (emailFinal || "manual_no_email").trim().toLowerCase();
      // Si el email cambió, regenerar el safeId
      const safeIdFinal = emailSafeFinal.replace(/[^a-z0-9]/g, "_") + "_" + Date.now().toString().slice(-4);

      // 4. Procesar datos clave y skills
      let respuestasFiltro = {};
      if (salario || monitoreo || disponibilidad || herramientas || logro_destacado) {
          respuestasFiltro = {
              salario: salario || "",
              monitoreo: monitoreo || "",
              disponibilidad: disponibilidad || "",
              herramientas: herramientas || "",
              logro_destacado: logro_destacado || ""
          };
      }

      let competenciasTecnicasArray = [];
      if (competencias_tecnicas) {
          try {
              competenciasTecnicasArray = JSON.parse(competencias_tecnicas);
          } catch(e) {
              console.warn("Error parseando competencias_tecnicas:", e);
          }
      }

      let habilidadesBlandasArray = [];
      if (habilidades_blandas) {
          try {
              habilidadesBlandasArray = JSON.parse(habilidades_blandas);
          } catch(e) {
              console.warn("Error parseando habilidades_blandas:", e);
          }
      }

      // 5. Guardar en Firestore (La Verdad Única - Fuente 80)
      const nombreUsuario = req.body.usuario_accion || req.body.responsable || "Admin";
      
      const nuevoCandidato = {
          id: safeIdFinal,
          nombre: nombreFinal || "Candidato Manual",
          email: emailSafeFinal,
          puesto: puesto || "Sin especificar",
          
          // Datos del Archivo
          cv_url: publicCvUrl,
          cv_storage_path: destFileName,
          tiene_pdf: true,
          texto_extraido: textoCV, // Guardamos texto para no gastar OCR después
          
          // Datos clave y skills
          respuestas_filtro: respuestasFiltro,
          competencias_tecnicas: competenciasTecnicasArray,
          habilidades_blandas: habilidadesBlandasArray,
          
          // Datos de IA (Pendiente de análisis automático)
          ia_score: null,
          ia_motivos: null,
          ia_alertas: [],
          ia_status: "analyzing",
          
          // Reseñas generadas por IA (pendiente)
          reseña_cv: null,
          
          // Metadatos
          origen: "carga_manual",
          creado_en: admin.firestore.FieldValue.serverTimestamp(),
          actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
          
          // ETIQUETAS DE ESTADO
          stage: 'stage_1',
          status_interno: 'new',
          
          // HISTORIAL INICIAL
          historial_movimientos: [
            {
                date: new Date().toISOString(),
                event: 'Ingreso Manual',
                detail: `CV cargado manualmente por: ${nombreUsuario}. Análisis automático iniciado.`,
                usuario: nombreUsuario
            }
          ]
      };

      // Escribimos en la colección maestra (MAIN_COLLECTION definida en Fuente 29)
      await firestore.collection("CVs_staging").doc(safeIdFinal).set(nuevoCandidato);

      // 6. Ejecutar análisis automático
      console.log(`🤖 Iniciando análisis automático para candidato manual: ${safeIdFinal}`);
      try {
          // 6.1. Generar reseña del CV
          console.log(`📝 Generando reseña del CV...`);
          const reseñaCV = await generarResenaCV(textoCV, puesto || "Perfil Externo");
          
          // 6.2. Construir texto del candidato con datos clave y skills para el análisis
          let textoCandidato = "";
          if (Object.keys(respuestasFiltro).length > 0) {
              textoCandidato += "DATOS CLAVE:\n";
              if (respuestasFiltro.salario) textoCandidato += `- Salario: ${respuestasFiltro.salario}\n`;
              if (respuestasFiltro.monitoreo) textoCandidato += `- Monitoreo: ${respuestasFiltro.monitoreo}\n`;
              if (respuestasFiltro.disponibilidad) textoCandidato += `- Disponibilidad: ${respuestasFiltro.disponibilidad}\n`;
              if (respuestasFiltro.herramientas) textoCandidato += `- Herramientas: ${respuestasFiltro.herramientas}\n`;
              if (respuestasFiltro.logro_destacado) textoCandidato += `- Logro Destacado: ${respuestasFiltro.logro_destacado}\n`;
          }
          if (competenciasTecnicasArray.length > 0) {
              textoCandidato += "\nCOMPETENCIAS TÉCNICAS:\n";
              competenciasTecnicasArray.forEach(comp => {
                  if (comp.competencia && comp.nivel) {
                      textoCandidato += `- ${comp.competencia}: ${comp.nivel}\n`;
                  }
              });
          }
          if (habilidadesBlandasArray.length > 0) {
              textoCandidato += "\nHABILIDADES BLANDAS:\n";
              habilidadesBlandasArray.forEach(hab => {
                  if (hab.habilidad && hab.nivel) {
                      textoCandidato += `- ${hab.habilidad}: ${hab.nivel}\n`;
                  }
              });
          }
          
          // Si no hay datos clave, usar el texto del CV como base
          if (!textoCandidato.trim()) {
              textoCandidato = textoCV.slice(0, 15000);
          }

          // 6.3. Generar score, motivos y alertas usando verificaConocimientosMinimos
          console.log(`🤖 Generando score y análisis...`);
          const analisisIA = await verificaConocimientosMinimos(
              puesto || "Perfil Externo",
              textoCandidato,
              "", // declaraciones vacías para carga manual
              reseñaCV, // reseña del CV
              null // sin video para carga manual
          );

          // 6.4. Actualizar candidato con el análisis completo
          await firestore.collection("CVs_staging").doc(safeIdFinal).update({
              ia_score: analisisIA.score || null,
              ia_motivos: analisisIA.motivos || null,
              ia_alertas: analisisIA.alertas || [],
              ia_status: "analyzed",
              reseña_cv: reseñaCV || null,
              actualizado_en: admin.firestore.FieldValue.serverTimestamp()
          });

          console.log(`✅ Análisis automático completado para: ${safeIdFinal} - Score: ${analisisIA.score}`);
      } catch (error) {
          console.error(`❌ Error ejecutando análisis automático para ${safeIdFinal}:`, error);
          await firestore.collection("CVs_staging").doc(safeIdFinal).update({
              ia_status: "error_analysis",
              ia_motivos: `Error en análisis automático: ${error.message}`
          });
      }

      // Limpieza del archivo temporal local
      try { fs.unlinkSync(req.file.path); } catch(e) {}

      console.log(`✅ Candidato manual guardado y analizado: ${safeIdFinal} - Origen: ${nuevoCandidato.origen}`);
      res.json({ 
        ok: true, 
        id: safeIdFinal, 
        score: null,
        nombre: nombreFinal || "Candidato Manual",
        email: emailSafeFinal
      });

  } catch (error) {
      console.error("❌ Error en carga manual:", error);
      res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 📊 ENDPOINT: ESTADO DE WEBHOOKS (ANTES DE STATIC PARA QUE NO SE INTERCEPTE)
// ==========================================
app.get("/webhooks/status", async (req, res) => {
  try {
    const ahora = new Date();
    const hace24Horas = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const hace48Horas = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
    
    const webhooks = ["zoho_form1", "zoho_form2"];
    const estados = {};
    
    for (const webhookName of webhooks) {
      const docRef = firestore.collection("webhook_status").doc(webhookName);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        // Si nunca se ejecutó, está rojo
        estados[webhookName] = {
          status: "rojo",
          razon: "Nunca se ha ejecutado",
          ultima_ejecucion: null
        };
        continue;
      }
      
      const data = doc.data();
      const ultimaEjecucion = data.ultima_ejecucion ? new Date(data.ultima_ejecucion) : null;
      
      // Contar errores recientes (últimas 24 horas)
      const erroresRef = docRef.collection("errores_recientes");
      const erroresSnap = await erroresRef
        .where("fecha", ">=", hace24Horas.toISOString())
        .get();
      const cantidadErrores = erroresSnap.size;
      
      // LÓGICA: Verde o Rojo
      let status = "verde";
      let razon = "Funcionando correctamente";
      
      if (!ultimaEjecucion) {
        status = "rojo";
        razon = "Sin registro de ejecución";
      } else if (ultimaEjecucion < hace48Horas) {
        status = "rojo";
        razon = `Última ejecución hace más de 48 horas (${Math.round((ahora - ultimaEjecucion) / (1000 * 60 * 60))} horas)`;
      } else if (cantidadErrores >= 3) {
        status = "rojo";
        razon = `${cantidadErrores} errores en las últimas 24 horas`;
      } else if (!data.exito) {
        status = "rojo";
        razon = data.error || "Última ejecución falló";
      } else if (ultimaEjecucion < hace24Horas) {
        status = "amarillo"; // Opcional: estado intermedio
        razon = `Última ejecución hace ${Math.round((ahora - ultimaEjecucion) / (1000 * 60 * 60))} horas`;
      }
      
      estados[webhookName] = {
        status: status,
        razon: razon,
        ultima_ejecucion: ultimaEjecucion ? ultimaEjecucion.toISOString() : null,
        cantidad_errores_24h: cantidadErrores
      };
    }
    
    res.json(estados);
  } catch (error) {
    console.error("Error obteniendo estado de webhooks:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🧪 ENDPOINT DE PRUEBA: CANDIDATO COMPLETO PARA TESTING
// ==========================================
// Handler GET para mostrar instrucciones si acceden desde navegador
app.get("/test/candidato-completo", (req, res) => {
  res.json({
    mensaje: "Este endpoint requiere método POST",
    instrucciones: [
      "Desde terminal: curl -X POST http://localhost:3001/test/candidato-completo",
      "O usa un cliente REST como Postman/Insomnia",
      "O ejecuta: fetch('/test/candidato-completo', {method: 'POST'}) desde la consola del navegador"
    ]
  });
});

app.post("/test/candidato-completo", async (req, res) => {
  try {
    console.log("🧪 Creando candidato de prueba completo...");
    
    // Generar ID único para el candidato de prueba
    const testId = `test_candidato_${Date.now()}`;
    const nowISO = new Date().toISOString();
    
    // Texto de CV de ejemplo (simulado)
    const textoCVEjemplo = `
    PERFIL PROFESIONAL
    Desarrollador Full Stack con 5 años de experiencia en React, Node.js y bases de datos.
    
    EXPERIENCIA LABORAL
    - Desarrollador Senior en TechCorp (2020-2024)
      * Desarrollo de aplicaciones web con React y TypeScript
      * Implementación de APIs REST con Node.js y Express
      * Gestión de bases de datos MongoDB y PostgreSQL
      * Liderazgo de equipo de 3 desarrolladores
    
    HABILIDADES TÉCNICAS
    - Frontend: React, TypeScript, HTML5, CSS3, Tailwind CSS
    - Backend: Node.js, Express, REST APIs
    - Bases de Datos: MongoDB, PostgreSQL, MySQL
    - Herramientas: Git, Docker, AWS
    
    EDUCACIÓN
    - Ingeniería en Sistemas, Universidad Nacional (2015-2019)
    `;
    
    // Transcripción de entrevista de ejemplo
    const transcripcionEjemplo = `
    ENTREVISTADOR: Hola, gracias por venir. Cuéntame sobre tu experiencia con React.
    
    CANDIDATO: Tengo 5 años trabajando con React. He desarrollado aplicaciones complejas con hooks, 
    context API, y últimamente estoy usando Next.js para proyectos más grandes. También tengo 
    experiencia con TypeScript que me ayuda mucho con el tipado.
    
    ENTREVISTADOR: ¿Cómo manejas el estado en aplicaciones grandes?
    
    CANDIDATO: Depende del caso. Para estado local uso useState, para estado compartido uso Context 
    o Redux cuando es necesario. En proyectos recientes he usado Zustand que es más ligero.
    
    ENTREVISTADOR: ¿Tienes experiencia con bases de datos?
    
    CANDIDATO: Sí, he trabajado con MongoDB en proyectos NoSQL y PostgreSQL para datos relacionales. 
    También he diseñado esquemas y optimizado queries.
    
    ENTREVISTADOR: ¿Cuál es tu nivel de inglés?
    
    CANDIDATO: Tengo nivel B2, puedo comunicarme bien en inglés técnico y participar en reuniones 
    con equipos internacionales.
    `;
    
    // Respuestas Form 1 (simuladas)
    const respuestasForm1 = {
      salario: "Sí, acepta el rango salarial",
      monitoreo: "Sí, acepta monitoreo",
      disponibilidad: "Tiempo completo, horario flexible",
      herramientas: "React, Node.js, MongoDB, PostgreSQL, TypeScript",
      logro_destacado: "Lideré el desarrollo de una plataforma que aumentó las ventas en 40%"
    };
    
    // Respuestas Form 2 (simuladas)
    const respuestasForm2 = {
      experiencia_react: "5 años",
      proyectos_complejos: "Sí, he desarrollado aplicaciones con más de 50 componentes",
      manejo_estado: "useState, Context API, Redux, Zustand",
      nivel_ingles: "B2 - Intermedio-Avanzado",
      disponibilidad_horaria: "Tiempo completo, horario flexible"
    };
    
    // Análisis inicial de IA (simulado)
    const analisisInicial = await verificaConocimientosMinimos(
      "Desarrollador Full Stack",
      textoCVEjemplo
    );
    
    // Crear candidato completo en stage_1
    const candidatoCompleto = {
      id: testId,
      nombre: "Juan Pérez (TEST)",
      email: `test_${Date.now()}@example.com`,
      puesto: "Desarrollador Full Stack",
      telefono: "+54 11 1234-5678",
      
      // CV y texto
      texto_extraido: textoCVEjemplo,
      cv_url: "", // Sin CV real para prueba
      tiene_pdf: false,
      
      // Respuestas de formularios
      respuestas_filtro: respuestasForm1,
      respuestas_form2: {
        data: respuestasForm2,
        fecha_recepcion: nowISO
      },
      process_step_2_form: "received",
      
      // Datos de IA
      ia_score: Math.min(analisisInicial.score || 75, 80), // Máximo 80 en stage_1
      ia_motivos: analisisInicial.motivos || "Candidato con experiencia sólida en tecnologías requeridas",
      ia_alertas: analisisInicial.alertas || [],
      ia_status: "processed",
      
      // Estado inicial
      stage: 'stage_1',
      status_interno: 'new',
      assignedTo: null,
      
      // Datos de entrevista (para cuando pase a stage_2)
      meet_link: "https://meet.google.com/test-abc-defg-hij",
      transcripcion_entrevista: transcripcionEjemplo, // Guardamos con este nombre (se mapea a interview_transcript en /buscar)
      interview_transcript: transcripcionEjemplo, // También guardamos con el nombre que espera el frontend
      
      // Metadatos
      origen: "test_completo",
      creado_en: admin.firestore.FieldValue.serverTimestamp(),
      actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
      
      // Historial inicial
      historial_movimientos: [
        {
          date: nowISO,
          event: 'Ingreso al Pipeline',
          detail: 'Candidato de prueba creado automáticamente',
          usuario: 'Sistema'
        }
      ]
    };
    
    // Guardar en Firestore
    await firestore.collection("CVs_staging").doc(testId).set(candidatoCompleto);
    
    console.log(`✅ Candidato de prueba creado: ${testId}`);
    
    res.json({
      ok: true,
      id: testId,
      mensaje: "Candidato de prueba creado exitosamente",
      datos: {
        nombre: candidatoCompleto.nombre,
        email: candidatoCompleto.email,
        stage: candidatoCompleto.stage,
        score: candidatoCompleto.ia_score,
        tiene_form2: true,
        tiene_transcripcion: true
      },
      pasos_siguientes: [
        "1. Ve al dashboard y busca el candidato en 'Explorar' (stage_1)",
        "2. Aprueba el candidato a 'Gestión' (stage_2)",
        "3. Verifica que tenga meet_link y transcripción",
        "4. Analiza la entrevista con el botón 'Analizar con IA'",
        "5. Mueve a 'Informe' (stage_3) y genera el informe final"
      ]
    });
    
  } catch (error) {
    console.error("❌ Error creando candidato de prueba:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================================
// 🔧 ENDPOINT: REPARAR CV DESVINCULADO
// ==========================================================================
// Busca el CV en Storage y lo enlaza al candidato, recalculando el score si es necesario

app.post("/candidatos/:id/reparar-cv", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔧 [REPARAR] Iniciando reparación para candidato: ${id}`);
    
    // 1. Obtener datos del candidato
    const docRef = firestore.collection("CVs_staging").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Candidato no encontrado" });
    }
    
    const datosActuales = docSnap.data();
    
    // 2. Verificar si realmente necesita reparación
    if (datosActuales.cv_url && datosActuales.cv_url.length > 5 && datosActuales.tiene_pdf) {
      return res.json({
        ok: true,
        mensaje: "El CV ya está enlazado correctamente",
        cv_url: datosActuales.cv_url,
        tiene_pdf: datosActuales.tiene_pdf
      });
    }
    
    // 3. Buscar el PDF en Storage (ruta esperada)
    const rutaEsperada = `CVs_staging/files/${id}_CV.pdf`;
    const bucketFile = bucket.file(rutaEsperada);
    
    let publicCvUrl = null;
    let tienePdfEnStorage = false;
    
    try {
      // Verificar si el archivo existe
      const [exists] = await bucketFile.exists();
      
      if (exists) {
        console.log(`✅ [REPARAR] PDF encontrado en Storage: ${rutaEsperada}`);
        
        // Generar signed URL
        const [signedUrl] = await bucketFile.getSignedUrl({
          action: 'read',
          expires: '01-01-2035'
        });
        
        publicCvUrl = signedUrl;
        tienePdfEnStorage = true;
        console.log(`✅ [REPARAR] Signed URL generado correctamente`);
      } else {
        console.log(`⚠️ [REPARAR] PDF no encontrado en ruta esperada: ${rutaEsperada}`);
        
        // Intentar buscar en otras rutas posibles
        const rutasAlternativas = [
          `CVs_staging/files/${id}.pdf`,
          `CVs_staging/${id}_CV.pdf`,
          `CVs_staging/files/${datosActuales.email?.replace(/[^a-z0-9]/g, "_")}_CV.pdf`
        ];
        
        for (const rutaAlt of rutasAlternativas) {
          const fileAlt = bucket.file(rutaAlt);
          const [existsAlt] = await fileAlt.exists();
          
          if (existsAlt) {
            console.log(`✅ [REPARAR] PDF encontrado en ruta alternativa: ${rutaAlt}`);
            const [signedUrlAlt] = await fileAlt.getSignedUrl({
              action: 'read',
              expires: '01-01-2035'
            });
            publicCvUrl = signedUrlAlt;
            tienePdfEnStorage = true;
            break;
          }
        }
      }
    } catch (error) {
      console.error(`❌ [REPARAR] Error buscando PDF en Storage:`, error.message);
    }
    
    // 4. Preparar actualización
    const updateData = {
      actualizado_en: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (tienePdfEnStorage && publicCvUrl) {
      updateData.cv_url = publicCvUrl;
      updateData.tiene_pdf = true;
      console.log(`✅ [REPARAR] CV enlazado correctamente`);
    } else {
      // Si no se encontró el PDF, pero hay reseña_cv, significa que el CV fue procesado
      // pero el archivo no está en Storage. Marcamos esto para debugging
      updateData.debug_cv_no_encontrado = {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ruta_buscada: rutaEsperada,
        tiene_reseña_cv: !!datosActuales.reseña_cv
      };
      
      return res.status(404).json({
        ok: false,
        error: "PDF no encontrado en Storage",
        mensaje: "El CV no se encontró en ninguna de las rutas esperadas. Puede que el archivo no se haya subido correctamente.",
        rutas_buscadas: [rutaEsperada, `CVs_staging/files/${id}.pdf`, `CVs_staging/${id}_CV.pdf`]
      });
    }
    
    // 5. Si hay reseña_cv pero el score está en 0, recalcular
    if (datosActuales.reseña_cv && (!datosActuales.ia_score || datosActuales.ia_score === 0)) {
      console.log(`🤖 [REPARAR] Recalculando score con reseña existente...`);
      
      try {
        const respuestasFiltro = datosActuales.respuestas_filtro || {};
        const datosFormulario = JSON.stringify(respuestasFiltro);
        
        const analisisIA = await verificaConocimientosMinimos(
          datosActuales.puesto || "General",
          datosFormulario,
          "", // declaraciones vacío
          datosActuales.reseña_cv, // Reseña del CV existente
          datosActuales.reseña_video || null // Reseña del video si existe
        );
        
        // Limitar score según origen y si hay video procesado
        const origen = datosActuales.origen || "";
        const tieneVideoProcesado = datosActuales.reseña_video ? true : false;
        
        if (origen === "webhook_zoho_passive" || origen.includes("zoho") || origen.includes("mail")) {
            // Ingreso por formulario
            if (tieneVideoProcesado) {
                analisisIA.score = Math.min(analisisIA.score, 80);
            } else {
                analisisIA.score = Math.min(analisisIA.score, 75);
            }
        } else if (origen === "carga_manual") {
            // Ingreso manual
            if (tieneVideoProcesado) {
                analisisIA.score = Math.min(analisisIA.score, 75);
            } else {
                analisisIA.score = Math.min(analisisIA.score, 70);
            }
        }
        
        updateData.ia_score = analisisIA.score;
        updateData.ia_motivos = analisisIA.motivos;
        updateData.ia_alertas = analisisIA.alertas || [];
        updateData.ia_status = "processed";
        
        console.log(`✅ [REPARAR] Score recalculado: ${analisisIA.score}`);
      } catch (error) {
        console.error(`❌ [REPARAR] Error recalculando score:`, error.message);
        // No fallamos si el score no se puede recalcular, solo actualizamos el CV
      }
    }
    
    // 6. Agregar evento al historial
    const eventoReparacion = {
      date: new Date().toISOString(),
      event: 'CV Reparado',
      detail: tienePdfEnStorage 
        ? 'CV encontrado en Storage y enlazado correctamente' 
        : 'Intento de reparación (CV no encontrado)',
      usuario: 'Sistema (Reparación Automática)'
    };
    
    updateData.historial_movimientos = admin.firestore.FieldValue.arrayUnion(eventoReparacion);
    
    // 7. Actualizar en Firestore
    await docRef.set(updateData, { merge: true });
    
    console.log(`✅ [REPARAR] Reparación completada para ${id}`);
    
    res.json({
      ok: true,
      mensaje: tienePdfEnStorage 
        ? "CV encontrado y enlazado correctamente" 
        : "Reparación completada (CV no encontrado en Storage)",
      datos: {
        cv_url: publicCvUrl || datosActuales.cv_url || "",
        tiene_pdf: tienePdfEnStorage,
        score_anterior: datosActuales.ia_score || 0,
        score_nuevo: updateData.ia_score || datosActuales.ia_score || 0,
        score_recalculado: !!updateData.ia_score
      }
    });
    
  } catch (error) {
    console.error("❌ [REPARAR] Error en reparación:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ==========================================================================
// 🔧 ENDPOINT: REPARAR CV DESDE WORKDRIVE (NUEVO)
// ==========================================================================
// Busca el CV en el backup de WorkDrive y lo reprocesa completamente

app.post("/candidatos/:id/reparar-desde-workdrive", async (req, res) => {
  try {
    const { id } = req.params;
    const responsable = req.body.responsable || "Sistema";
    
    console.log(`🔧 [REPARAR-WD] Iniciando reparación desde WorkDrive para: ${id}`);
    
    // 1. Obtener datos del candidato
    const docRef = firestore.collection("CVs_staging").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Candidato no encontrado" });
    }
    
    const candidato = docSnap.data();
    const email = candidato.email || "";
    const nombre = candidato.nombre || "";
    
    console.log(`📋 [REPARAR-WD] Buscando CV para: ${nombre} (${email})`);
    
    // 2. Construir términos de búsqueda
    // Intentamos varias estrategias para encontrar el archivo
    const terminosBusqueda = [];
    
    // Por email (más preciso)
    if (email) {
      const emailSafe = email.replace(/[^a-zA-Z0-9]/g, '_');
      terminosBusqueda.push(emailSafe);
      terminosBusqueda.push(email.split('@')[0]); // Solo la parte antes del @
    }
    
    // Por nombre
    if (nombre) {
      const nombreSafe = nombre.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      terminosBusqueda.push(nombreSafe);
      // También el primer nombre solo
      const primerNombre = nombreSafe.split(' ')[0];
      if (primerNombre.length > 2) {
        terminosBusqueda.push(primerNombre);
      }
    }
    
    // Por ID del documento
    terminosBusqueda.push(id);
    
    // 3. Buscar en WorkDrive
    let archivoEncontrado = null;
    
    for (const termino of terminosBusqueda) {
      if (!termino) continue;
      
      console.log(`🔍 [REPARAR-WD] Buscando con término: "${termino}"`);
      
      try {
        const resultados = await buscarArchivoEnWorkDrive(termino);
        
        // Filtrar solo PDFs
        const pdfs = resultados.filter(f => 
          f.attributes?.name?.toLowerCase().endsWith('.pdf') ||
          f.attributes?.extension === 'pdf'
        );
        
        if (pdfs.length > 0) {
          // Tomar el más reciente o el que mejor coincida
          archivoEncontrado = pdfs[0];
          console.log(`✅ [REPARAR-WD] PDF encontrado: ${archivoEncontrado.attributes?.name}`);
          break;
        }
      } catch (searchError) {
        console.warn(`⚠️ [REPARAR-WD] Error buscando "${termino}":`, searchError.message);
      }
    }
    
    if (!archivoEncontrado) {
      return res.status(404).json({
        ok: false,
        error: "CV no encontrado en WorkDrive",
        mensaje: "No se encontró ningún PDF que coincida con este candidato en el backup de WorkDrive.",
        terminos_buscados: terminosBusqueda.filter(t => t)
      });
    }
    
    // 4. Descargar el archivo de WorkDrive
    console.log(`📥 [REPARAR-WD] Descargando: ${archivoEncontrado.id}`);
    const pdfBuffer = await descargarArchivoDeWorkDrive(archivoEncontrado.id);
    
    // 5. Subir a Firebase Storage
    const fileName = `CVs_staging/files/${id}_CV.pdf`;
    const bucketFile = bucket.file(fileName);
    
    await bucketFile.save(pdfBuffer, {
      metadata: { contentType: 'application/pdf' }
    });
    
    // Generar URL firmada
    const [signedUrl] = await bucketFile.getSignedUrl({
      action: 'read',
      expires: '01-01-2035'
    });
    
    console.log(`✅ [REPARAR-WD] PDF subido a Storage: ${fileName}`);
    
    // 6. Extraer texto del PDF
    const pdfData = await pdfParse(pdfBuffer);
    const textoCV = pdfData.text.slice(0, 20000);
    
    console.log(`📝 [REPARAR-WD] Texto extraído: ${textoCV.length} caracteres`);
    
    // 7. Generar reseña del CV con IA
    const reseñaCV = await generarResenaCV(textoCV, candidato.puesto || "General");
    console.log(`🤖 [REPARAR-WD] Reseña generada`);
    
    // 8. Calcular score
    const respuestasFiltro = candidato.respuestas_filtro || {};
    const datosFormulario = JSON.stringify(respuestasFiltro);
    
    const analisisIA = await verificaConocimientosMinimos(
      candidato.puesto || "General",
      datosFormulario,
      "",
      reseñaCV,
      candidato.reseña_video || null
    );
    
    // Aplicar límites según origen
    const origen = candidato.origen || "";
    const tieneVideo = !!candidato.reseña_video;
    
    if (origen.includes("zoho") || origen.includes("webhook")) {
      analisisIA.score = Math.min(analisisIA.score, tieneVideo ? 80 : 75);
    } else {
      analisisIA.score = Math.min(analisisIA.score, tieneVideo ? 75 : 70);
    }
    
    // 9. Actualizar Firestore
    const updateData = {
      cv_url: signedUrl,
      tiene_pdf: true,
      texto_extraido: textoCV,
      reseña_cv: reseñaCV,
      ia_score: analisisIA.score,
      ia_motivos: analisisIA.motivos,
      ia_alertas: analisisIA.alertas || [],
      ia_status: "processed",
      actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
      
      // Registro de la reparación
      reparacion_workdrive: {
        fecha: new Date().toISOString(),
        archivo_original: archivoEncontrado.attributes?.name || "desconocido",
        archivo_id: archivoEncontrado.id,
        responsable: responsable
      },
      
      // Historial
      historial_movimientos: admin.firestore.FieldValue.arrayUnion({
        date: new Date().toISOString(),
        event: 'CV Reparado desde WorkDrive',
        detail: `CV recuperado del backup (${archivoEncontrado.attributes?.name}). Nuevo score: ${analisisIA.score}`,
        usuario: responsable
      })
    };
    
    await docRef.update(updateData);
    
    console.log(`✅ [REPARAR-WD] Reparación completada. Score: ${analisisIA.score}`);
    
    res.json({
      ok: true,
      mensaje: "CV recuperado y reprocesado exitosamente desde WorkDrive",
      datos: {
        archivo_encontrado: archivoEncontrado.attributes?.name,
        cv_url: signedUrl,
        tiene_pdf: true,
        score_anterior: candidato.ia_score || 0,
        score_nuevo: analisisIA.score,
        motivos: analisisIA.motivos,
        alertas: analisisIA.alertas || []
      }
    });
    
  } catch (error) {
    console.error("❌ [REPARAR-WD] Error:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ==========================================================================
// 🎥 ENDPOINT: REPARAR VIDEO DESDE WORKDRIVE
// ==========================================================================
app.post("/candidatos/:id/reparar-video-workdrive", async (req, res) => {
  try {
    const { id } = req.params;
    const responsable = req.body.responsable || "Sistema";
    
    console.log(`🎥 [REPARAR-VIDEO-WD] Iniciando para: ${id}`);
    
    // 1. Obtener datos del candidato
    const docRef = firestore.collection("CVs_staging").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Candidato no encontrado" });
    }
    
    const candidato = docSnap.data();
    const email = candidato.email || "";
    
    console.log(`📋 [REPARAR-VIDEO-WD] Buscando video para: ${candidato.nombre} (${email})`);
    
    // 2. Buscar video en WorkDrive
    const videos = await buscarVideoEnWorkDrive(email);
    
    if (!videos || videos.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Video no encontrado en WorkDrive",
        mensaje: "No se encontró ningún video en la carpeta del candidato."
      });
    }
    
    // Tomar el primer video encontrado
    const videoEncontrado = videos[0];
    const nombreArchivo = videoEncontrado.attributes?.name || 'video.mp4';
    console.log(`✅ [REPARAR-VIDEO-WD] Video encontrado: ${nombreArchivo}`);
    
    // 3. Descargar el video de WorkDrive
    console.log(`📥 [REPARAR-VIDEO-WD] Descargando video...`);
    const videoBuffer = await descargarArchivoDeWorkDrive(videoEncontrado.id);
    const sizeMB = videoBuffer.length / (1024 * 1024);
    console.log(`📊 [REPARAR-VIDEO-WD] Tamaño: ${sizeMB.toFixed(2)} MB`);
    
    // 4. Comprimir si es mayor a 50MB
    let bufferFinal = videoBuffer;
    const extension = nombreArchivo.split('.').pop() || 'mp4';
    
    if (sizeMB > 50) {
      console.log(`🎬 [REPARAR-VIDEO-WD] Comprimiendo video (${sizeMB.toFixed(2)} MB > 50 MB)...`);
      
      const tempInputPath = path.join(os.tmpdir(), `${id}_video_original_${Date.now()}.${extension}`);
      const tempOutputPath = path.join(os.tmpdir(), `${id}_video_comprimido_${Date.now()}.mp4`);
      
      // Guardar temporalmente
      fs.writeFileSync(tempInputPath, videoBuffer);
      
      // Comprimir
      await comprimirVideoA50MB(tempInputPath, tempOutputPath);
      
      // Leer el comprimido
      bufferFinal = fs.readFileSync(tempOutputPath);
      
      // Limpiar archivos temporales
      try { fs.unlinkSync(tempInputPath); } catch(e) {}
      try { fs.unlinkSync(tempOutputPath); } catch(e) {}
      
      const newSizeMB = bufferFinal.length / (1024 * 1024);
      console.log(`✅ [REPARAR-VIDEO-WD] Video comprimido: ${sizeMB.toFixed(2)} MB → ${newSizeMB.toFixed(2)} MB`);
    }
    
    // 5. Subir a Firebase Storage
    const fileName = `CVs_staging/videos/${id}_video.mp4`;
    const bucketFile = bucket.file(fileName);
    
    await bucketFile.save(bufferFinal, {
      metadata: { contentType: 'video/mp4' }
    });
    
    // Generar URL firmada
    const [signedUrl] = await bucketFile.getSignedUrl({
      action: 'read',
      expires: '01-01-2035'
    });
    
    console.log(`✅ [REPARAR-VIDEO-WD] Video subido a Storage: ${fileName}`);
    
    // 6. Analizar video con IA (usando la función existente)
    console.log(`🤖 [REPARAR-VIDEO-WD] Analizando video con IA...`);
    
    const resultadoVideo = await generarResenaVideo(signedUrl, candidato.puesto || "General");
    
    let reseñaVideo = null;
    let videoError = null;
    
    if (resultadoVideo.reseña) {
      reseñaVideo = resultadoVideo.reseña;
      console.log(`✅ [REPARAR-VIDEO-WD] Reseña generada correctamente`);
    } else {
      videoError = resultadoVideo.error;
      console.log(`⚠️ [REPARAR-VIDEO-WD] Error generando reseña: ${videoError}`);
    }
    
    // 7. Recalcular score si hay reseña del video
    let nuevoScore = candidato.ia_score || 0;
    let nuevoMotivos = candidato.ia_motivos || "";
    let nuevasAlertas = candidato.ia_alertas || [];
    
    if (reseñaVideo) {
      console.log(`🤖 [REPARAR-VIDEO-WD] Recalculando score con video...`);
      
      const reseñaCV = candidato.reseña_cv || null;
      const respuestasFiltro = candidato.respuestas_filtro || {};
      const datosFormulario = JSON.stringify(respuestasFiltro);
      
      try {
        const analisisIA = await verificaConocimientosMinimos(
          candidato.puesto || "General",
          datosFormulario,
          "",
          reseñaCV,
          reseñaVideo
        );
        
        // Aplicar límite según origen
        const origen = candidato.origen || "";
        if (origen === "webhook_zoho_passive" || origen.includes("zoho") || origen.includes("mail")) {
          analisisIA.score = Math.min(analisisIA.score, 80);
        } else if (origen === "carga_manual") {
          analisisIA.score = Math.min(analisisIA.score, 75);
        }
        
        nuevoScore = analisisIA.score;
        nuevoMotivos = analisisIA.motivos;
        nuevasAlertas = analisisIA.alertas || [];
        
        console.log(`✅ [REPARAR-VIDEO-WD] Score recalculado: ${candidato.ia_score || 0} → ${nuevoScore}`);
        
      } catch (e) {
        console.error(`❌ [REPARAR-VIDEO-WD] Error recalculando score:`, e.message);
      }
    }
    
    // 8. Actualizar Firestore
    const updateData = {
      video_url: signedUrl,
      video_tipo: 'archivo',
      reseña_video: reseñaVideo,
      video_error: videoError,
      ia_score: nuevoScore,
      ia_motivos: nuevoMotivos,
      ia_alertas: nuevasAlertas,
      actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
      
      // Registro de la reparación
      reparacion_video_workdrive: {
        fecha: new Date().toISOString(),
        archivo_original: nombreArchivo,
        archivo_id: videoEncontrado.id,
        responsable: responsable,
        comprimido: sizeMB > 50
      },
      
      // Historial
      historial_movimientos: admin.firestore.FieldValue.arrayUnion({
        date: new Date().toISOString(),
        event: 'Video Recuperado desde WorkDrive',
        detail: `Video recuperado (${nombreArchivo}), analizado con IA. Score: ${candidato.ia_score || 0} → ${nuevoScore}`,
        usuario: responsable
      })
    };
    
    await docRef.update(updateData);
    
    console.log(`✅ [REPARAR-VIDEO-WD] Reparación completada`);
    
    res.json({
      ok: true,
      mensaje: "Video recuperado, analizado y score recalculado exitosamente",
      datos: {
        archivo_encontrado: nombreArchivo,
        video_url: signedUrl,
        comprimido: sizeMB > 50,
        tamaño_original_mb: sizeMB.toFixed(2),
        score_anterior: candidato.ia_score || 0,
        score_nuevo: nuevoScore,
        tiene_reseña: !!reseñaVideo
      }
    });
    
  } catch (error) {
    console.error("❌ [REPARAR-VIDEO-WD] Error:", error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ==========================================
// 📦 2. FRONTEND (Sirve la página web)
// ==========================================
app.use(express.static(path.join(__dirname, "cliente_lite"))); 

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "cliente_lite", "dashboard.html"));
});
// ==========================================================================
// 📎 ENDPOINT CORREGIDO: CARGA MANUAL DE ARCHIVOS (PDF/TXT)
// ==========================================================================

// Usamos nombres únicos para evitar conflictos con variables de arriba
const uploadManual = multer({ storage: multer.memoryStorage() });
const pdfParser = require('pdf-parse'); 

app.post("/manual-upload", uploadManual.single('cv'), async (req, res) => {
    try {
        console.log("⚡ Recibida petición de carga manual con archivo...");
        
        const { notas, puesto, responsable } = req.body;
        let textoCV = "";

        // Validación: ¿Llegó el archivo?
        if (!req.file) {
            return res.status(400).json({ error: "Error: No llegó ningún archivo al servidor." });
        }

        console.log(`📂 Procesando archivo: ${req.file.originalname} (${req.file.mimetype})`);

        // 1. Extracción de texto según formato
        if (req.file.mimetype === "application/pdf") {
            const data = await pdfParser(req.file.buffer);
            textoCV = data.text;
        } else {
            // Asumimos texto plano o intentamos leerlo como tal
            textoCV = req.file.buffer.toString('utf-8');
        }

        // Validación de contenido extraído
        if (!textoCV || textoCV.length < 50) {
            throw new Error("El archivo parece vacío o es una imagen escaneada sin texto seleccionable.");
        }

        // 2. Llamada a Gemini (Tu función de IA existente)
        const informe = await generarDatosParaInforme(
            textoCV, 
            puesto || "Perfil Analizado Manualmente", 
            notas || "Sin notas adicionales",
            {}, // Sin form2
            "Análisis directo de archivo adjunto", 
            responsable || "Admin"
        );

        if (!informe) throw new Error("Gemini no devolvió resultados válidos.");

        // 3. Respuesta exitosa
        res.json(informe);

    } catch (e) {
        console.error("❌ Error en manual-upload:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 🔌 3. HELPERS DE ARRANQUE Y SERVIDOR
// ==========================================

// Función auxiliar que faltaba para verificar Storage
async function storageProbe() {
  try {
    if (!bucket) return false;
    const [exists] = await bucket.exists();
    if (exists) return true;
    console.log("⚠️ El bucket no existe o no es accesible.");
    return false; 
  } catch (e) {
    console.error("❌ Error verificando Storage:", e.message);
    return false;
  }
}

// ==========================================
// 🎥 FUNCIÓN MEJORADA: GENERAR RESEÑA DE VIDEO
// ==========================================
/**
 * Procesa un video y genera una reseña usando Gemini
 * FLUJO UNIFICADO: Descarga → Valida → Comprime → Sube a GCS → Analiza con Gemini
 * 
 * @param {string} videoUrl - URL del video (Drive, YouTube, Firebase Storage, etc.)
 * @param {string} puesto - Puesto al que aplica el candidato
 * @returns {Promise<{reseña: string|null, error: string|null, linkPublico: boolean}>}
 */
async function generarResenaVideo(videoUrl, puesto) {
  const logPrefix = '🎥 [VIDEO]';
  let tempFilePath = null;
  let compressedFilePath = null;
  
  try {
    console.log(`${logPrefix} ═══════════════════════════════════════════`);
    console.log(`${logPrefix} Iniciando procesamiento de video`);
    console.log(`${logPrefix} URL original: ${videoUrl.substring(0, 100)}...`);
    console.log(`${logPrefix} Puesto: ${puesto}`);
    
    // ═══════════════════════════════════════════
    // PASO 1: VALIDAR QUE EL LINK ES PÚBLICO
    // ═══════════════════════════════════════════
    console.log(`${logPrefix} ─────────────────────────────────────────`);
    console.log(`${logPrefix} PASO 1: Validando acceso público...`);
    
    const verificacion = await verificarLinkVideoPublico(videoUrl);
    
    if (!verificacion.esPublico) {
      console.error(`${logPrefix} ❌ Link no público o no accesible`);
      return {
        reseña: null,
        error: "El link del video no es público o no es accesible. El candidato debe compartir el link como público.",
        linkPublico: false
      };
    }
    
    console.log(`${logPrefix} ✅ Link es público y accesible`);
    
    // Validar que sea un video (excepto para Drive y YouTube que validaremos después)
    if (!verificacion.esVideo && 
        !videoUrl.includes('drive.google.com') && 
        !videoUrl.includes('youtube.com') && 
        !videoUrl.includes('youtu.be')) {
      console.error(`${logPrefix} ❌ El link no parece ser un video`);
      return {
        reseña: null,
        error: "El link no parece ser un video válido.",
        linkPublico: true
      };
    }
    
    // ═══════════════════════════════════════════
    // PASO 2: IDENTIFICAR TIPO DE URL
    // ═══════════════════════════════════════════
    console.log(`${logPrefix} ─────────────────────────────────────────`);
    console.log(`${logPrefix} PASO 2: Identificando tipo de URL...`);
    
    const esFirebaseStorage = videoUrl.includes('firebasestorage.app');
    const esGCS = videoUrl.includes('storage.googleapis.com') || videoUrl.includes('storage.cloud.google.com');
    const esDrive = videoUrl.includes('drive.google.com');
    const esYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    
    let tipoURL = 'desconocido';
    if (esFirebaseStorage) tipoURL = 'Firebase Storage';
    else if (esGCS) tipoURL = 'Google Cloud Storage';
    else if (esDrive) tipoURL = 'Google Drive';
    else if (esYouTube) tipoURL = 'YouTube';
    
    console.log(`${logPrefix} 🔍 Tipo detectado: ${tipoURL}`);
    
    
    // ═══════════════════════════════════════════
    // PASO 3: PROCESAR SEGÚN EL TIPO
    // ═══════════════════════════════════════════
    console.log(`${logPrefix} ─────────────────────────────────────────`);
    console.log(`${logPrefix} PASO 3: Procesando según tipo...`);
    
    let gcsUri = null;
    
    // CASO 1: Firebase Storage → Convertir a gs:// directamente
    if (esFirebaseStorage) {
      console.log(`${logPrefix} 📍 Firebase Storage detectado`);
      console.log(`${logPrefix} 🔍 URL: ${videoUrl}`);
      
      // FALLBACK: Descargar directamente en lugar de parsear
      console.log(`${logPrefix} 📥 Descargando desde Firebase Storage...`);
      
      const videoResponse = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 300000,
        maxContentLength: 500 * 1024 * 1024,
        maxRedirects: 10,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
        }
      });
      
      // Validar que es un video
      const contentType = videoResponse.headers['content-type'] || '';
      if (!contentType.includes('video')) {
        throw new Error(`No es un video. Content-Type: ${contentType}`);
      }
      
      const sizeMB = videoResponse.data.length / (1024 * 1024);
      console.log(`${logPrefix} 📊 Descargado: ${sizeMB.toFixed(2)} MB`);
      
      // Guardar temporalmente
      tempFilePath = path.join(os.tmpdir(), `video_firebase_${crypto.randomUUID()}.mp4`);
      fs.writeFileSync(tempFilePath, Buffer.from(videoResponse.data));
      
      // Comprimir si es necesario
      let videoFileToUpload = tempFilePath;
      let finalSizeMB = sizeMB;
      
      if (sizeMB > 50) {
        console.log(`${logPrefix} 🗜️ Comprimiendo...`);
        compressedFilePath = path.join(os.tmpdir(), `video_compressed_${crypto.randomUUID()}.mp4`);
        
        try {
          const compressionResult = await comprimirVideoA50MB(tempFilePath, compressedFilePath);
          if (compressionResult.success) {
            videoFileToUpload = compressedFilePath;
            finalSizeMB = compressionResult.sizeMB;
            console.log(`${logPrefix} ✅ Comprimido: ${finalSizeMB.toFixed(2)} MB`);
          }
        } catch (err) {
          console.warn(`${logPrefix} ⚠️ No se pudo comprimir, usando original`);
        }
      }
      
      // Subir a nuestro bucket
      console.log(`${logPrefix} ☁️ Subiendo a GCS...`);
      const videoFileName = `CVs_staging/videos/${crypto.randomUUID()}_video.mp4`;
      const videoBucketFile = bucket.file(videoFileName);
      
      const videoBuffer = fs.readFileSync(videoFileToUpload);
      await videoBucketFile.save(videoBuffer, {
        metadata: { contentType: "video/mp4" }
      });
      
      // 🔥 FIX: Usar el bucket correcto para Gemini
      // 🔥 FIX: Hardcodear el bucket correcto temporalmente
      const realBucketName = 'gtcia-16ad9.appspot.com'; // Cambiar .firebasestorage.app por .appspot.com
      gcsUri = `gs://${realBucketName}/${videoFileName}`;

      console.log(`${logPrefix} 🔍 DEBUG - Bucket usado: ${realBucketName}`);
      console.log(`${logPrefix} 🔍 DEBUG - URI completo: ${gcsUri}`);
      console.log(`${logPrefix} ✅ Subido: ${gcsUri}`);
    }
    
    // CASO 2: GCS Signed URL → Convertir a gs://
    else if (esGCS) {
      console.log(`${logPrefix} 📍 GCS Signed URL detectado, convirtiendo a gs://...`);
      try {
        const urlObj = new URL(videoUrl);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        if (pathParts.length >= 2) {
          const bucketName = pathParts[0];
          const filePath = pathParts.slice(1).join('/');
          gcsUri = `gs://${bucketName}/${filePath}`;
          console.log(`${logPrefix} ✅ Convertido a: ${gcsUri}`);
        } else {
          throw new Error('No se pudo extraer bucket y path de la URL de GCS');
        }
      } catch (parseError) {
        console.error(`${logPrefix} ❌ Error parseando GCS URL: ${parseError.message}`);
        throw new Error(`URL de GCS inválida: ${parseError.message}`);
      }
    }
    
    // CASO 3 y 4: Drive o YouTube → Descargar, validar, subir a GCS
    else if (esDrive || esYouTube) {
      console.log(`${logPrefix} 📥 ${tipoURL} detectado, iniciando descarga y procesamiento...`);
      
      // Convertir URL de Drive si es necesario
      let downloadUrl = videoUrl;
      if (esDrive) {
        downloadUrl = convertirLinkDriveADescarga(videoUrl);
        console.log(`${logPrefix} 🔄 URL de descarga: ${downloadUrl.substring(0, 80)}...`);
      }
      
      // Descargar el video
      console.log(`${logPrefix} ⏬ Descargando video...`);
      const videoResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 300000, // 5 minutos
        maxContentLength: 500 * 1024 * 1024, // 500MB máximo
        maxRedirects: 10,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
        },
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        }
      });
      
      // Validar que es un video, no HTML
      const contentType = videoResponse.headers['content-type'] || '';
      const dataStart = Buffer.from(videoResponse.data.slice(0, Math.min(1000, videoResponse.data.length))).toString('utf-8');
      const isHTML = contentType.includes('text/html') || 
                     dataStart.includes('<!DOCTYPE') ||
                     dataStart.includes('<html') ||
                     dataStart.includes('Google Drive');
      
      if (isHTML) {
        console.error(`${logPrefix} ❌ La respuesta es HTML, no un video`);
        throw new Error(
          esDrive 
            ? 'Google Drive devolvió HTML en lugar del video. El archivo puede ser muy grande o requiere permisos especiales. Verifica que el link sea público y accesible.'
            : 'La URL devolvió HTML en lugar del video.'
        );
      }
      
      // Validar tamaño mínimo
      const sizeMB = videoResponse.data.length / (1024 * 1024);
      console.log(`${logPrefix} 📊 Tamaño descargado: ${sizeMB.toFixed(2)} MB`);
      
      if (videoResponse.data.length < 1024) {
        console.error(`${logPrefix} ❌ Archivo demasiado pequeño`);
        throw new Error(`Video descargado es demasiado pequeño (${videoResponse.data.length} bytes). Posible error en la descarga.`);
      }
      
      // Guardar temporalmente
      tempFilePath = path.join(os.tmpdir(), `video_original_${crypto.randomUUID()}.mp4`);
      fs.writeFileSync(tempFilePath, Buffer.from(videoResponse.data));
      console.log(`${logPrefix} 💾 Guardado temporalmente en: ${tempFilePath}`);
      
      // Comprimir si es necesario (>50MB)
      let videoFileToUpload = tempFilePath;
      let finalSizeMB = sizeMB;
      
      if (sizeMB > 50) {
        console.log(`${logPrefix} 🗜️ Video >50MB, comprimiendo...`);
        compressedFilePath = path.join(os.tmpdir(), `video_compressed_${crypto.randomUUID()}.mp4`);
        
        try {
          const compressionResult = await comprimirVideoA50MB(tempFilePath, compressedFilePath);
          
          if (compressionResult.success) {
            console.log(`${logPrefix} ✅ Compresión exitosa: ${compressionResult.sizeMB.toFixed(2)} MB`);
            videoFileToUpload = compressedFilePath;
            finalSizeMB = compressionResult.sizeMB;
          } else {
            console.warn(`${logPrefix} ⚠️ No se pudo comprimir, usando original`);
          }
        } catch (compressionError) {
          console.warn(`${logPrefix} ⚠️ Error en compresión: ${compressionError.message}`);
          console.warn(`${logPrefix} ⚠️ Usando video original sin comprimir`);
        }
      }
      
      // Subir a nuestro bucket de GCS
      console.log(`${logPrefix} ☁️ Subiendo a GCS (${finalSizeMB.toFixed(2)} MB)...`);
      const videoFileName = `CVs_staging/videos/${crypto.randomUUID()}_video.mp4`;
      const videoBucketFile = bucket.file(videoFileName);
      
      const videoBuffer = fs.readFileSync(videoFileToUpload);
      await videoBucketFile.save(videoBuffer, {
        metadata: { 
          contentType: "video/mp4",
          metadata: {
            originalSize: sizeMB.toFixed(2) + 'MB',
            finalSize: finalSizeMB.toFixed(2) + 'MB',
            compressed: finalSizeMB < sizeMB ? 'yes' : 'no',
            uploadedAt: new Date().toISOString()
          }
        }
      });
      
      gcsUri = `gs://${bucket.name}/${videoFileName}`;
      console.log(`${logPrefix} ✅ Subido exitosamente a: ${gcsUri}`);
    }
    
    // CASO DESCONOCIDO: Error
    else {
      throw new Error(`Tipo de URL no soportado: ${videoUrl}`);
    }
    
    // ═══════════════════════════════════════════
    // PASO 4: VALIDAR QUE TENEMOS UN GCS URI
    // ═══════════════════════════════════════════
    console.log(`${logPrefix} ─────────────────────────────────────────`);
    console.log(`${logPrefix} PASO 4: Analizando con Gemini...`);
    
    // Verificar que tenemos un archivo local o en GCS
    let archivoParaGemini = tempFilePath || compressedFilePath;
    
    if (!archivoParaGemini || !fs.existsSync(archivoParaGemini)) {
      throw new Error('No hay archivo de video disponible para analizar');
    }
    
    console.log(`${logPrefix} 📁 Archivo a analizar: ${archivoParaGemini}`);
    
    // Obtener tamaño del archivo
    const stats = fs.statSync(archivoParaGemini);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`${logPrefix} 📊 Tamaño del archivo: ${fileSizeMB.toFixed(2)} MB`);
    
    // ═══════════════════════════════════════════════════════════════
    // OPCIÓN A: USAR FILE API DE GEMINI (Recomendado para archivos grandes)
    // ═══════════════════════════════════════════════════════════════
    
    const { GoogleAIFileManager } = require("@google/generative-ai/server");
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    
    console.log(`${logPrefix} 📤 Subiendo video al File API de Gemini...`);
    
    // Subir el archivo al File API de Gemini
    const uploadResult = await fileManager.uploadFile(archivoParaGemini, {
      mimeType: "video/mp4",
      displayName: `Video candidato - ${puesto}`,
    });
    
    console.log(`${logPrefix} ✅ Video subido al File API de Gemini`);
    console.log(`${logPrefix} 📝 File URI: ${uploadResult.file.uri}`);
    console.log(`${logPrefix} 📝 File Name: ${uploadResult.file.name}`);
    console.log(`${logPrefix} 📊 Tamaño: ${(uploadResult.file.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    
    // Esperar a que el archivo esté procesado
    console.log(`${logPrefix} ⏳ Esperando procesamiento del archivo...`);
    
    let file = await fileManager.getFile(uploadResult.file.name);
    while (file.state === "PROCESSING") {
      console.log(`${logPrefix} ⏳ Archivo aún procesándose... (${file.state})`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2 segundos
      file = await fileManager.getFile(uploadResult.file.name);
    }
    
    if (file.state === "FAILED") {
      throw new Error("El procesamiento del archivo en Gemini falló");
    }
    
    console.log(`${logPrefix} ✅ Archivo procesado y listo: ${file.state}`);
    
    // Ahora analizar el video con Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Usando modelo más reciente
    
    const prompt = `
    ACTÚA COMO: Headhunter Senior para Global Talent Connections.
    OBJETIVO: Detectar TALENTO y ACTITUD PROFESIONAL, no calidad cinematográfica.
    
    CONTEXTO: Candidato postulando para el puesto de "${puesto}".
    INPUT: Video de presentación del candidato.
    
    INSTRUCCIONES DE EVALUACIÓN (CRITERIO HUMANIZADO):
    
    1. 🧠 ACTITUD Y PREPARACIÓN (Factor #1 - Peso 60%):
       - ¿El candidato se tomó el tiempo de encuadrarse y mirar a la cámara? (Señal de respeto).
       - ¿Habla con seguridad, dicción clara y sin muletillas constantes? (Señal de seniority).
       - ¿Su entorno está ORDENADO? 
         * TOLERA: Habitaciones humildes, paredes simples, leve eco o calidad de cámara media/baja.
         * PENALIZA: Desorden evidente (ropa tirada, camas deshechas), ruidos molestos externos (tráfico, TV, familiares gritando), o grabar con el celular en la mano moviéndose.
    
    2. 🗣️ CONTENIDO DEL DISCURSO (Peso 40%):
       - ¿Responde quién es y qué hace de forma directa?
       - ¿Estructura sus ideas lógicamente o divaga?
    
    3. ⚖️ JUICIO DE VALOR (La Regla de Oro):
       - Si el audio/video es técnicamente pobre pero el candidato es EXCELENTE (buena voz, serio, preparado), la reseña debe ser POSITIVA con una nota al pie sobre "Mejorar setup técnico".
       - NO rechaces talento por falta de micrófono caro. Rechaza por falta de esfuerzo.
    
    FORMATO DE SALIDA (Reseña Constructiva):
    Redacta un párrafo equilibrado. Si hay fallos técnicos, menciónalos como "Áreas de mejora" pero no dejes que opaquen las virtudes del candidato.
    
    Ejemplo de Tono Esperado (Caso Alejandra):
    "Candidata con excelente dicción y presencia profesional, demostrando sólida preparación y estructura en su discurso (consecuente con su perfil de locutora). Mantiene contacto visual firme y transmite seguridad. Aunque el entorno presenta desafíos técnicos (contraluz y eco leve) que deberían optimizarse para un rol remoto final, su actitud y claridad comunicativa son de nivel Senior y superan estas limitaciones de hardware."
    `;
    
    const parts = [
      { text: prompt },
      { 
        fileData: {
          mimeType: uploadResult.file.mimeType,
          fileUri: uploadResult.file.uri
        }
      }
    ];
    
    console.log(`${logPrefix} 🤖 Enviando a Gemini para análisis...`);
    
    try {
      const result = await model.generateContent(parts);
      const reseña = result.response.text().trim();
      
      console.log(`${logPrefix} ✅ Análisis completado`);
      console.log(`${logPrefix} 📝 Reseña generada (${reseña.length} caracteres)`);
      
      // Eliminar el archivo del File API de Gemini para ahorrar espacio
      try {
        await fileManager.deleteFile(uploadResult.file.name);
        console.log(`${logPrefix} 🗑️ Archivo eliminado del File API de Gemini`);
      } catch (deleteError) {
        console.warn(`${logPrefix} ⚠️ No se pudo eliminar archivo de Gemini: ${deleteError.message}`);
      }
      
      console.log(`${logPrefix} ═══════════════════════════════════════════`);
      
      // Limpiar archivos temporales locales
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`${logPrefix} 🧹 Archivo temporal eliminado: ${tempFilePath}`);
      }
      if (compressedFilePath && fs.existsSync(compressedFilePath)) {
        fs.unlinkSync(compressedFilePath);
        console.log(`${logPrefix} 🧹 Archivo comprimido eliminado: ${compressedFilePath}`);
      }
      
      return {
        reseña: reseña,
        error: null,
        linkPublico: true
      };
      
    } catch (geminiError) {
      console.error(`${logPrefix} ❌ Error de Gemini: ${geminiError.message}`);
      
      // Intentar eliminar el archivo de Gemini en caso de error
      try {
        await fileManager.deleteFile(uploadResult.file.name);
      } catch (e) {
        // Ignorar errores al eliminar
      }
      
      throw geminiError;
    }
    
  } catch (error) {
    console.error(`${logPrefix} ═══════════════════════════════════════════`);
    console.error(`${logPrefix} ❌ ERROR EN PROCESAMIENTO DE VIDEO`);
    console.error(`${logPrefix} Mensaje: ${error.message}`);
    console.error(`${logPrefix} Stack: ${error.stack}`);
    console.error(`${logPrefix} ═══════════════════════════════════════════`);
    
    // Limpiar archivos temporales en caso de error
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`${logPrefix} 🧹 Archivo temporal eliminado (cleanup): ${tempFilePath}`);
      }
      if (compressedFilePath && fs.existsSync(compressedFilePath)) {
        fs.unlinkSync(compressedFilePath);
        console.log(`${logPrefix} 🧹 Archivo comprimido eliminado (cleanup): ${compressedFilePath}`);
      }
    } catch (cleanupError) {
      console.error(`${logPrefix} ⚠️ Error limpiando archivos temporales: ${cleanupError.message}`);
    }
    
    // Clasificar tipo de error
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('403') || errorMsg.includes('permission') || errorMsg.includes('access')) {
      return {
        reseña: null,
        error: "El link del video no es público o no es accesible. El candidato debe compartir el link como público.",
        linkPublico: false
      };
    }
    
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      return {
        reseña: null,
        error: "Tiempo de espera agotado al descargar el video. El archivo puede ser demasiado grande o la conexión es lenta.",
        linkPublico: null
      };
    }
    
    if (errorMsg.includes('html') || errorMsg.includes('google drive')) {
      return {
        reseña: null,
        error: "No se pudo descargar el video de Google Drive. Verifica que el link sea público y que el archivo no sea demasiado grande.",
        linkPublico: false
      };
    }
    
    return {
      reseña: null,
      error: `Error al procesar video: ${error.message}`,
      linkPublico: null
    };
  }
}

// ==========================================
// 🎥 PROCESAMIENTO ASÍNCRONO DE VIDEOS
// ==========================================

/**
 * Procesa un video en background sin bloquear el hilo principal
 * Esta función se ejecuta de forma asíncrona después de guardar el candidato inicial
 * 
 * @param {string} candidatoId - ID del candidato (safeId)
 * @param {string} videoUrl - URL del video a procesar
 * @param {string} puesto - Puesto al que aplica el candidato
 */
async function procesarVideoEnBackground(candidatoId, videoUrl, puesto) {
  const logPrefix = '🎥 [BACKGROUND]';
  
  try {
    console.log(`${logPrefix} ═══════════════════════════════════════════`);
    console.log(`${logPrefix} Iniciando procesamiento de video en background`);
    console.log(`${logPrefix} Candidato ID: ${candidatoId}`);
    console.log(`${logPrefix} Video URL: ${videoUrl.substring(0, 100)}...`);
    console.log(`${logPrefix} Puesto: ${puesto}`);
    
    // Actualizar estado a "processing" para indicar que está en proceso
    const docRef = firestore.collection(MAIN_COLLECTION).doc(candidatoId);
    await docRef.set({
      video_status: "processing",
      actualizado_en: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Procesar el video (esto puede tomar varios minutos)
    const resultadoVideo = await generarResenaVideo(videoUrl, puesto);
    
    if (resultadoVideo.reseña) {
      console.log(`${logPrefix} ✅ Reseña del video generada correctamente`);
      
      // Actualizar candidato con la reseña del video y regenerar score
      await actualizarCandidatoConVideo(
        candidatoId,
        resultadoVideo.reseña,
        resultadoVideo.linkPublico,
        null // sin error
      );
      
      console.log(`${logPrefix} ✅ Candidato ${candidatoId} actualizado con video procesado`);
    } else {
      console.error(`${logPrefix} ❌ Error procesando video: ${resultadoVideo.error}`);
      
      // Actualizar candidato con el error
      await actualizarCandidatoConVideo(
        candidatoId,
        null, // sin reseña
        resultadoVideo.linkPublico,
        resultadoVideo.error
      );
      
      console.log(`${logPrefix} ⚠️ Candidato ${candidatoId} actualizado con error de video`);
    }
    
  } catch (error) {
    console.error(`${logPrefix} ❌ Error crítico en procesamiento de video:`, error);
    
    // Actualizar estado a "error" en caso de fallo crítico
    try {
      const docRef = firestore.collection(MAIN_COLLECTION).doc(candidatoId);
      await docRef.set({
        video_status: "error",
        video_error: `Error crítico: ${error.message}`,
        actualizado_en: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (updateError) {
      console.error(`${logPrefix} ❌ No se pudo actualizar estado de error:`, updateError);
    }
  }
}

/**
 * Actualiza la ficha del candidato con la reseña del video y regenera el score
 * 
 * @param {string} candidatoId - ID del candidato (safeId)
 * @param {string|null} reseñaVideo - Reseña generada del video (null si hubo error)
 * @param {boolean|null} videoLinkPublico - Si el link del video es público
 * @param {string|null} videoError - Mensaje de error si hubo problema (null si éxito)
 */
async function actualizarCandidatoConVideo(candidatoId, reseñaVideo, videoLinkPublico, videoError) {
  const logPrefix = '🔄 [ACTUALIZAR]';
  
  try {
    console.log(`${logPrefix} Actualizando candidato ${candidatoId} con resultado del video...`);
    
    const docRef = firestore.collection(MAIN_COLLECTION).doc(candidatoId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      console.error(`${logPrefix} ❌ Candidato ${candidatoId} no encontrado`);
      return;
    }
    
    const datosActuales = docSnap.data();
    
    // Preparar datos para actualización
    const updateData = {
      reseña_video: reseñaVideo || null,
      video_error: videoError || null,
      video_link_publico: videoLinkPublico || null,
      video_status: reseñaVideo ? "completed" : "error",
      actualizado_en: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Si tenemos reseña del video, regenerar el score con CV + Video
    if (reseñaVideo) {
      console.log(`${logPrefix} Regenerando score con CV + Video...`);
      
      const reseñaCV = datosActuales.reseña_cv || null;
      const respuestasFiltro = datosActuales.respuestas_filtro || {};
      const datosFormulario = JSON.stringify(respuestasFiltro);
      const puesto = datosActuales.puesto || "General";
      
      try {
        const analisisIA = await verificaConocimientosMinimos(
          puesto,
          datosFormulario,
          "", // declaraciones vacío
          reseñaCV,
          reseñaVideo // Ahora sí tenemos la reseña del video
        );
        
        // Si el video se procesó correctamente, límite de 80
        analisisIA.score = Math.min(analisisIA.score, 80);
        
        // Actualizar score y motivos
        updateData.ia_score = analisisIA.score;
        updateData.ia_motivos = analisisIA.motivos;
        
        // Actualizar alertas (remover la alerta de "Video pendiente" si existe)
        if (Array.isArray(analisisIA.alertas)) {
          updateData.ia_alertas = analisisIA.alertas.filter(
            alerta => !alerta.includes("Video pendiente")
          );
        } else {
          updateData.ia_alertas = [];
        }
        
        console.log(`${logPrefix} ✅ Score regenerado: ${analisisIA.score}`);
      } catch (scoreError) {
        console.error(`${logPrefix} ❌ Error regenerando score:`, scoreError.message);
        // No actualizamos el score si falla, pero sí guardamos la reseña del video
      }
    } else {
      // Si hubo error, mantener el score actual pero agregar alerta
      const alertasActuales = datosActuales.ia_alertas || [];
      if (!Array.isArray(alertasActuales)) {
        updateData.ia_alertas = [`Video no procesado: ${videoError}`];
      } else {
        updateData.ia_alertas = [
          ...alertasActuales.filter(a => !a.includes("Video pendiente") && !a.includes("Video no procesado")),
          `Video no procesado: ${videoError}`
        ];
      }
    }
    
    // Actualizar en Firestore
    await docRef.set(updateData, { merge: true });
    
    console.log(`${logPrefix} ✅ Candidato ${candidatoId} actualizado correctamente`);
    
  } catch (error) {
    console.error(`${logPrefix} ❌ Error actualizando candidato:`, error);
    throw error; // Re-lanzar para que se maneje en procesarVideoEnBackground
  }
}

// ==========================================
// 🔧 HELPERS NECESARIOS
// ==========================================

/**
 * Convierte un link de Google Drive a formato de descarga directa
 */
function convertirLinkDriveADescarga(driveUrl) {
  // Si ya es un link de descarga, retornarlo tal cual
  if (driveUrl.includes('/uc?export=download') || driveUrl.includes('/uc?id=')) {
    return driveUrl;
  }
  
  // Extraer el ID del archivo
  let fileId = null;
  
  // Patrón 1: /file/d/FILE_ID
  const match1 = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) {
    fileId = match1[1];
  }
  
  // Patrón 2: /open?id=FILE_ID
  const match2 = driveUrl.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
  if (match2) {
    fileId = match2[1];
  }
  
  // Patrón 3: ?id=FILE_ID
  const match3 = driveUrl.match(/\?id=([a-zA-Z0-9_-]+)/);
  if (match3) {
    fileId = match3[1];
  }
  
  if (fileId) {
    // Usar el formato que maneja mejor los archivos grandes con confirm=t
    return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  }
  
  // Si no se pudo extraer el ID, retornar el original
  console.warn(`⚠️ [VIDEO] No se pudo extraer ID de Drive desde: ${driveUrl}`);
  return driveUrl;
}

/**
 * Comprime un video a máximo 50MB usando ffmpeg
 * REQUISITO: Tener ffmpeg instalado en el sistema
 */
function comprimirVideoA50MB(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Verificar que ffmpeg esté disponible
    if (typeof ffmpeg !== 'function') {
      return reject(new Error('ffmpeg no está disponible. Instala el paquete fluent-ffmpeg y ffmpeg en el sistema.'));
    }
    
    // Obtener metadata del video
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        return reject(new Error(`Error obteniendo metadata del video: ${err.message}`));
      }
      
      const duracionSegundos = metadata.format.duration || 60;
      const tamañoMaximoBytes = 50 * 1024 * 1024; // 50MB
      const tamañoMaximoBits = tamañoMaximoBytes * 8;
      
      // Calcular bitrate objetivo (dejando espacio para audio ~128kbps)
      const bitrateVideoKbps = Math.max(500, Math.floor((tamañoMaximoBits / duracionSegundos - 128000) / 1000));
      
      console.log(`📊 [COMPRESIÓN] Duración: ${duracionSegundos.toFixed(2)}s, Bitrate: ${bitrateVideoKbps}kbps`);
      
      // Comprimir
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(`${bitrateVideoKbps}k`)
        .audioBitrate('128k')
        .outputOptions([
          '-preset medium',
          '-crf 23',
          '-movflags +faststart'
        ])
        .on('start', (commandLine) => {
          console.log(`🎬 [COMPRESIÓN] Iniciando: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`📊 [COMPRESIÓN] Progreso: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          const stats = fs.statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          console.log(`✅ [COMPRESIÓN] Completado: ${sizeMB.toFixed(2)}MB`);
          
          resolve({
            success: true,
            sizeMB: sizeMB,
            error: null
          });
        })
        .on('error', (err) => {
          console.error(`❌ [COMPRESIÓN] Error: ${err.message}`);
          reject(new Error(`Error comprimiendo video: ${err.message}`));
        })
        .save(outputPath);
    });
  });
}

// ==========================================
// 📧 ENDPOINT PARA ENVIAR EMAILS CON HTML (GESTIÓN)
// ==========================================
app.post("/enviar-email", async (req, res) => {
  try {
    const { to, subject, htmlBody, tipo } = req.body;

    if (!to || !subject || !htmlBody) {
      return res.status(400).json({ error: "Faltan campos requeridos: to, subject, htmlBody" });
    }

    // URL de la imagen del pie de página
    const imagenPieUrl = 'https://raw.githubusercontent.com/nelsonmdq1996-sys/global-talent-platform/320cd201d6f93d77553f7bacb97bedfcd7cb0324/pie_email.png';
    
    // Agregar la imagen al final del HTML
    const htmlCompleto = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="white-space: pre-wrap;">${htmlBody.replace(/\n/g, '<br>')}</div>
          <div style="margin-top: 30px; text-align: center;">
            <img src="${imagenPieUrl}" alt="Global Talent Connections" style="max-width: 600px; width: 100%; height: auto; display: block; margin: 0 auto;" />
          </div>
        </body>
      </html>
    `;

    // Configurar el email
    const mailOptions = {
      from: `"Global Talent Connections" <${process.env.EMAIL_FROM}>`,
      to: to,
      subject: subject,
      html: htmlCompleto
    };

    // Enviar el email
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email enviado exitosamente a ${to} (tipo: ${tipo || 'general'})`);
    console.log(`   Message ID: ${info.messageId}`);

    res.json({ 
      success: true, 
      messageId: info.messageId,
      message: "Email enviado exitosamente"
    });

  } catch (error) {
    console.error("❌ Error enviando email:", error);
    res.status(500).json({ 
      error: "Error al enviar el email", 
      details: error.message 
    });
  }
});
// ==========================================
// 🗑️ FUNCIÓN: MOVER ARCHIVOS ENTRE CARPETAS EN STORAGE
// ==========================================
async function moverArchivoStorage(rutaOrigen, rutaDestino) {
  try {
      const archivoOrigen = bucket.file(rutaOrigen);
      const archivoDestino = bucket.file(rutaDestino);
      
      // Verificar que el archivo origen existe
      const [existe] = await archivoOrigen.exists();
      if (!existe) {
          console.log(`⚠️ [STORAGE] Archivo no existe en origen: ${rutaOrigen}`);
          return { success: false, error: 'Archivo no encontrado' };
      }
      
      // Copiar a destino
      await archivoOrigen.copy(archivoDestino);
      console.log(`📦 [STORAGE] Archivo copiado: ${rutaOrigen} → ${rutaDestino}`);
      
      // Eliminar original
      await archivoOrigen.delete();
      console.log(`🗑️ [STORAGE] Archivo original eliminado: ${rutaOrigen}`);
      
      // Generar nueva URL firmada
      const [nuevaUrl] = await archivoDestino.getSignedUrl({ 
          action: 'read', 
          expires: '01-01-2035' 
      });
      
      console.log(`✅ [STORAGE] Archivo movido exitosamente a: ${rutaDestino}`);
      return { success: true, nuevaUrl, rutaFinal: rutaDestino };
      
  } catch (error) {
      console.error(`❌ [STORAGE] Error moviendo archivo:`, error.message);
      return { success: false, error: error.message };
  }
}
// ==========================================
// 🛠️ ENDPOINT INTELIGENTE (PATCH) - ACTUALIZA Y GUARDA HISTORIAL
// ==========================================
app.patch("/candidatos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body; // Ej: { stage: 'stage_2', assignedTo: 'Gladymar' }

    if (!id || Object.keys(updates).length === 0) {
      return res.status(400).send("Faltan datos.");
    }

    // SIEMPRE apuntamos a la colección maestra
    const docRef = firestore.collection("CVs_staging").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        return res.status(404).send("Candidato no encontrado en CVs_staging");
    }

    // Preparar el objeto final de actualización
    let finalUpdate = {
      ...updates,
      actualizado_en: new Date().toISOString()
    };

    // 🕵️‍♂️ DETECTIVE DE HISTORIAL: Trackear todos los eventos importantes
    const nombreAccion = updates.usuario_accion || updates.assignedTo || 'Sistema';
    let nuevoEvento = null;
    
    // 1. TRACKING DE STATUS_INTERNO (eventos específicos)
    if (updates.status_interno === 'viewed') {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Visto',
            detail: `Visto por: ${nombreAccion}`,
            usuario: nombreAccion
        };
    } 
    else if (updates.status_interno === 'interview_scheduled') {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Link de Entrevista Enviada',
            detail: `Invitación de Meet/Zoom enviada por: ${nombreAccion}`,
            usuario: nombreAccion
        };
    }
    else if (updates.status_interno === 'pending_form2') {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Link de Formulario Enviado',
            detail: `Evaluación técnica (Form 2) enviada por: ${nombreAccion}`,
            usuario: nombreAccion
        };
    }
    // 1.5. TRACKING DE PROCESS_STEP_2_FORM (nuevo sistema)
    else if (updates.process_step_2_form === 'sent' && docSnap.data().process_step_2_form !== 'sent') {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Link de Formulario Enviado',
            detail: `Evaluación técnica (Form 2) enviada por: ${nombreAccion}`,
            usuario: nombreAccion
        };
    }
    // 2. TRACKING DE CAMBIOS DE STAGE
    else if (updates.stage === 'stage_2') {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Aprobado a Gestión',
            detail: `Aprobado por: ${nombreAccion}`,
            usuario: nombreAccion
        };
    } 
    else if (updates.stage === 'trash') {
      nuevoEvento = {
          date: new Date().toISOString(),
          event: 'Movido a Papelera',
          detail: updates.motivo || 'Descartado manualmente',
          usuario: nombreAccion
      };
      
      // 🗑️ MOVER ARCHIVOS A CV_garbage
      const datosActuales = docSnap.data();
      
      // Mover CV si existe en Storage
      if (datosActuales.cv_storage_path) {
          const rutaOriginalCV = datosActuales.cv_storage_path;
          const nombreArchivoCV = rutaOriginalCV.split('/').pop();
          const rutaGarbageCV = `CV_garbage/files/${nombreArchivoCV}`;
          
          console.log(`🗑️ [TRASH] Moviendo CV: ${rutaOriginalCV} → ${rutaGarbageCV}`);
          const resultadoCV = await moverArchivoStorage(rutaOriginalCV, rutaGarbageCV);
          
          if (resultadoCV.success) {
              finalUpdate.cv_storage_path = rutaGarbageCV;
              finalUpdate.cv_storage_path_original = rutaOriginalCV; // Guardar para poder restaurar
              finalUpdate.cv_url = resultadoCV.nuevaUrl;
              console.log(`✅ [TRASH] CV movido a papelera`);
          }
      }
      
      // Mover Video si existe en Storage
      const posiblesRutasVideo = [
          `CVs_staging/videos/${id}_video.mp4`,
          `CVs_staging/videos/${id}_video.webm`,
          `CVs_staging/videos/${id}_video.mov`
      ];
      
      for (const rutaVideo of posiblesRutasVideo) {
          try {
              const [existeVideo] = await bucket.file(rutaVideo).exists();
              if (existeVideo) {
                  const nombreArchivoVideo = rutaVideo.split('/').pop();
                  const rutaGarbageVideo = `CV_garbage/videos/${nombreArchivoVideo}`;
                  
                  console.log(`🗑️ [TRASH] Moviendo Video: ${rutaVideo} → ${rutaGarbageVideo}`);
                  const resultadoVideo = await moverArchivoStorage(rutaVideo, rutaGarbageVideo);
                  
                  if (resultadoVideo.success) {
                      finalUpdate.video_storage_path = rutaGarbageVideo;
                      finalUpdate.video_storage_path_original = rutaVideo;
                      finalUpdate.video_url = resultadoVideo.nuevaUrl;
                      console.log(`✅ [TRASH] Video movido a papelera`);
                  }
                  break; // Solo puede haber un video, salir del loop
              }
          } catch (e) {
              console.log(`⚠️ [TRASH] No se encontró video en: ${rutaVideo}`);
          }
      }
  }
  else if (updates.stage === 'stage_1' && docSnap.data().stage === 'trash') {
    // Solo trackear "Restaurado" si venía de papelera
    nuevoEvento = {
        date: new Date().toISOString(),
        event: 'Restaurado',
        detail: 'Recuperado de Papelera a Exploración',
        usuario: nombreAccion
    };
    
    // 🔄 RESTAURAR ARCHIVOS DESDE CV_garbage
    const datosActuales = docSnap.data();
    
    // Restaurar CV si tiene ruta original guardada
    if (datosActuales.cv_storage_path_original) {
        const rutaGarbageCV = datosActuales.cv_storage_path;
        const rutaOriginalCV = datosActuales.cv_storage_path_original;
        
        console.log(`🔄 [RESTORE] Restaurando CV: ${rutaGarbageCV} → ${rutaOriginalCV}`);
        const resultadoCV = await moverArchivoStorage(rutaGarbageCV, rutaOriginalCV);
        
        if (resultadoCV.success) {
            finalUpdate.cv_storage_path = rutaOriginalCV;
            finalUpdate.cv_url = resultadoCV.nuevaUrl;
            // Limpiar el campo de ruta original
            finalUpdate.cv_storage_path_original = admin.firestore.FieldValue.delete();
            console.log(`✅ [RESTORE] CV restaurado a ubicación original`);
        }
    }
    
    // Restaurar Video si tiene ruta original guardada
    if (datosActuales.video_storage_path_original) {
        const rutaGarbageVideo = datosActuales.video_storage_path;
        const rutaOriginalVideo = datosActuales.video_storage_path_original;
        
        console.log(`🔄 [RESTORE] Restaurando Video: ${rutaGarbageVideo} → ${rutaOriginalVideo}`);
        const resultadoVideo = await moverArchivoStorage(rutaGarbageVideo, rutaOriginalVideo);
        
        if (resultadoVideo.success) {
            finalUpdate.video_storage_path = rutaOriginalVideo;
            finalUpdate.video_url = resultadoVideo.nuevaUrl;
            // Limpiar el campo de ruta original
            finalUpdate.video_storage_path_original = admin.firestore.FieldValue.delete();
            console.log(`✅ [RESTORE] Video restaurado a ubicación original`);
        }
    }
}

    else if (updates.stage === 'stage_3') {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Aprobado Informe',
            detail: 'Candidato aprobado para informe final',
            usuario: nombreAccion
        };
    }
    // 3. TRACKING DE ASIGNACIÓN (solo si cambia assignedTo sin cambiar stage)
    else if (updates.assignedTo && !updates.stage) {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Asignado a Responsable',
            detail: `Asignado a: ${updates.assignedTo}`,
            usuario: nombreAccion
        };
    }
    // 4. TRACKING DE ENVÍO DE MAIL CON LINK DE MEET
    else if (updates.mail_meet_enviado === true) {
        nuevoEvento = {
            date: new Date().toISOString(),
            event: 'Link de Entrevista Enviado',
            detail: `Link de Meet/Zoom enviado a ${docSnap.data().email || 'candidato'}`,
            usuario: nombreAccion
        };
        // No guardamos el flag mail_meet_enviado, solo lo usamos para detectar el evento
        delete finalUpdate.mail_meet_enviado;
    }

    // Si hay evento para agregar, lo guardamos
    if (nuevoEvento) {
        finalUpdate.historial_movimientos = admin.firestore.FieldValue.arrayUnion(nuevoEvento);
    }

    // 🎥 DETECCIÓN Y ANÁLISIS AUTOMÁTICO DE VIDEO (Opción B)
    const datosActuales = docSnap.data();
    const videoUrlAnterior = datosActuales.video_url || null;
    const videoUrlNuevo = updates.video_url || null;
    
    // Si se está agregando o reemplazando un video
    if (videoUrlNuevo && videoUrlNuevo !== videoUrlAnterior) {
        console.log(`🎥 [DEBUG] Video detectado en PATCH para candidato ${id}`);
        console.log(`🎥 [DEBUG] Video anterior: ${videoUrlAnterior || 'ninguno'}`);
        console.log(`🎥 [DEBUG] Video nuevo: ${videoUrlNuevo.substring(0, 50)}...`);
        console.log(`🎥 [DEBUG] Score ANTES de analizar video: ${datosActuales.ia_score || 'N/A'}`);
        
        try {
            // 🎥 PROCESAR VIDEO DE GOOGLE DRIVE (descargar y comprimir si es necesario)
            let videoUrlParaAnalizar = videoUrlNuevo;
            const esGoogleDrive = videoUrlNuevo.includes('drive.google.com');
            
            if (esGoogleDrive) {
                console.log(`🎥 [DEBUG] Video de Google Drive detectado, procesando (descargar y comprimir)...`);
                try {
                    const resultadoProcesamiento = await procesarArchivoDesdeLink(videoUrlNuevo, 'video', id);
                    
                    if (resultadoProcesamiento.procesado && resultadoProcesamiento.urlPublica) {
                        // Si se procesó correctamente, usar la URL procesada (comprimida)
                        videoUrlParaAnalizar = resultadoProcesamiento.urlPublica;
                        // Actualizar el video_url con la URL procesada
                        finalUpdate.video_url = resultadoProcesamiento.urlPublica;
                        finalUpdate.video_tipo = "archivo_procesado"; // Marcar como procesado
                        console.log(`✅ [DEBUG] Video de Google Drive procesado y comprimido. Nueva URL: ${videoUrlParaAnalizar.substring(0, 80)}...`);
                    } else if (resultadoProcesamiento.error) {
                        console.warn(`⚠️ [DEBUG] Error procesando video de Drive: ${resultadoProcesamiento.error}`);
                        console.log(`⚠️ [DEBUG] Continuando con URL original para análisis...`);
                        // Continuar con la URL original si falla el procesamiento
                    }
                } catch (errorProcesamiento) {
                    console.error(`❌ [DEBUG] Error en procesamiento de Drive:`, errorProcesamiento.message);
                    console.log(`⚠️ [DEBUG] Continuando con URL original para análisis...`);
                    // Continuar con la URL original si falla
                }
            }
            
            // 1. Generar reseña del video (usando URL procesada si es Drive, o original si no)
            console.log(`🎥 [DEBUG] Iniciando generación de reseña del video...`);
            const resultadoVideo = await generarResenaVideo(videoUrlParaAnalizar, datosActuales.puesto || "General");
            
            let reseñaVideo = null;
            let videoError = null;
            let videoLinkPublico = null;
            
            if (resultadoVideo.reseña) {
                reseñaVideo = resultadoVideo.reseña;
                videoLinkPublico = resultadoVideo.linkPublico;
                console.log("✅ [DEBUG] Reseña del video generada correctamente");
                console.log(`✅ [DEBUG] Reseña (primeros 100 chars): ${reseñaVideo.substring(0, 100)}...`);
            } else {
                videoError = resultadoVideo.error;
                videoLinkPublico = resultadoVideo.linkPublico;
                console.log(`⚠️ [DEBUG] Error en video: ${videoError}`);
            }
            
            // 2. Re-analizar score con el video incluido
            if (reseñaVideo) {
                // Obtener datos existentes para el re-análisis
                const reseñaCV = datosActuales.reseña_cv || null;
                const respuestasFiltro = datosActuales.respuestas_filtro || {};
                const datosFormulario = JSON.stringify(respuestasFiltro);
                
                console.log(`🤖 [DEBUG] Iniciando re-análisis IA con CV + Video...`);
                console.log(`🤖 [DEBUG] Tiene reseña CV: ${!!reseñaCV}`);
                console.log(`🤖 [DEBUG] Tiene reseña Video: ${!!reseñaVideo}`);
                
                // Re-analizar con CV + Video
                const scoreAnterior = datosActuales.ia_score || 50;
                let analisisIA = { score: scoreAnterior, motivos: datosActuales.ia_motivos || "Pendiente", alertas: datosActuales.ia_alertas || [] };
                
                try {
                    analisisIA = await verificaConocimientosMinimos(
                        datosActuales.puesto || "General",
                        datosFormulario,
                        "", // declaraciones vacío
                        reseñaCV,
                        reseñaVideo
                    );
                    
                    console.log(`🤖 [DEBUG] Score DESPUÉS de IA (sin límite): ${analisisIA.score}`);
                    
                    // Mantener límite según origen
                    const origen = datosActuales.origen || "";
                    if (origen === "webhook_zoho_passive" || origen.includes("zoho") || origen.includes("mail")) {
                        // Si vino por Zoho, mantener límite de 80
                        analisisIA.score = Math.min(analisisIA.score, 80);
                        console.log(`🤖 [DEBUG] Origen: Zoho → Límite aplicado: 80`);
                    } else if (origen === "carga_manual") {
                        // Si es carga manual CON video agregado, límite de 75 (sin video es 70)
                        analisisIA.score = Math.min(analisisIA.score, 75);
                        console.log(`🤖 [DEBUG] Origen: Carga Manual → Límite aplicado: 75`);
                    }
                    
                    console.log(`🤖 [DEBUG] Score FINAL (con límite): ${analisisIA.score}`);
                    console.log(`📊 [DEBUG] Cambio de score: ${scoreAnterior} → ${analisisIA.score} (diferencia: ${analisisIA.score - scoreAnterior})`);
                    
                    // Agregar alerta si hay error con el video
                    if (videoError) {
                        if (!Array.isArray(analisisIA.alertas)) {
                            analisisIA.alertas = [];
                        }
                        analisisIA.alertas.push(`Video no procesado: ${videoError}`);
                    }
                    
                    // Actualizar score y motivos
                    finalUpdate.ia_score = analisisIA.score;
                    finalUpdate.ia_motivos = analisisIA.motivos;
                    finalUpdate.ia_alertas = analisisIA.alertas || [];
                    
                } catch (e) {
                    console.error("❌ [DEBUG] Error en re-análisis IA con video:", e.message);
                    console.error("❌ [DEBUG] Stack:", e.stack);
                }
            } else {
                console.log(`⚠️ [DEBUG] No se pudo generar reseña del video, no se re-analiza el score`);
            }
            
            // 3. Guardar datos del video
            finalUpdate.reseña_video = reseñaVideo || null;
            finalUpdate.video_error = videoError || null;
            finalUpdate.video_link_publico = videoLinkPublico;
            // Si no se procesó antes (no es Drive o falló), usar el tipo del update o "link" por defecto
            if (!finalUpdate.video_tipo) {
                finalUpdate.video_tipo = updates.video_tipo || "link"; // Por defecto "link" si se agrega manualmente
            }
            
            // 4. Agregar evento a cronología
            const eventoVideo = {
                date: new Date().toISOString(),
                event: videoUrlAnterior ? 'Video Reemplazado' : 'Video Agregado',
                detail: videoUrlAnterior 
                    ? `Video reemplazado y analizado por: ${nombreAccion}` 
                    : `Video agregado y analizado por: ${nombreAccion}`,
                usuario: nombreAccion
            };
            
            if (!finalUpdate.historial_movimientos) {
                finalUpdate.historial_movimientos = admin.firestore.FieldValue.arrayUnion(eventoVideo);
            } else {
                // Si ya hay un evento, agregamos este también
                finalUpdate.historial_movimientos = admin.firestore.FieldValue.arrayUnion(eventoVideo);
            }
            
        } catch (error) {
            console.error("❌ Error analizando video en PATCH:", error.message);
            // Si falla el análisis, guardamos el link igual pero con error
            finalUpdate.video_error = `Error al analizar video: ${error.message}`;
        }
    }

    // Impactar en Firestore
    await docRef.update(finalUpdate);

    console.log(`✅ [PATCH] Candidato ${id} actualizado en CVs_staging.`);
    res.json({ ok: true });

  } catch (error) {
    console.error("❌ Error actualizando candidato:", error);
    res.status(500).send("Error al actualizar.");
  }
});
// ==========================================
// 🧠 ENDPOINT: RE-ANÁLISIS POST-ENTREVISTA (FUSIÓN DE DATOS)
// ==========================================
app.post("/candidatos/:id/analizar-entrevista", async (req, res) => {
  try {
    const { id } = req.params;
    const { transcript } = req.body; // Texto de la entrevista

    if (!transcript) return res.status(400).json({ error: "Falta la transcripción" });

    // 1. Usamos la colección unificada
    const docRef = firestore.collection(MAIN_COLLECTION).doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) return res.status(404).json({ error: "Candidato no encontrado" });

    const data = docSnap.data();

    // 2. Prompt de Ingeniería: Fusión de Contextos
    const prompt = `
    ACTÚA COMO: Reclutador Senior de Global Talent Connections.
    OBJETIVO: Recalcular el puntaje del candidato cruzando toda la información previa (CV + Video + Formulario) con la ENTREVISTA recién realizada.
    
    --- CONTEXTO HISTÓRICO (FUENTES DE VERDAD PREVIAS) ---
    
    PERFIL SOLICITADO: "${data.puesto || 'General'}"
    
    ANÁLISIS DEL CV:
    "${data.reseña_cv || 'Sin análisis de CV disponible'}"
    
    ANÁLISIS DEL VIDEO DE PRESENTACIÓN:
    "${data.reseña_video || 'Sin análisis de video disponible'}"
    
    SCORE INICIAL (basado en CV y formulario): ${data.ia_score || 0}
    MOTIVOS DEL SCORE INICIAL: "${data.ia_motivos || 'Sin análisis previo'}"
    
    DATOS DECLARADOS EN FORMULARIO:
    - Salario aceptado: ${data.respuestasfiltro?.salario || 'No especificado'}
    - Acepta monitoreo: ${data.respuestasfiltro?.monitoreo || 'No especificado'}
    - Disponibilidad: ${data.respuestasfiltro?.disponibilidad || 'No especificado'}
    - Herramientas clave: ${data.respuestasfiltro?.herramientas || 'No especificado'}
    
    --- NUEVA EVIDENCIA (ENTREVISTA EN VIVO) ---
    TRANSCRIPCIÓN:
    "${transcript.slice(0, 15000)}"
    
    --- TAREA DE CONTRASTACIÓN ---
    
    1. 📋 VALIDACIÓN DE EXPERIENCIA:
       - ¿El candidato puede PROFUNDIZAR en la experiencia declarada en el CV con ejemplos concretos, o sus respuestas son vagas?
       - ¿Los logros/herramientas mencionados en CV se sostienen cuando se le pregunta por detalles específicos?
       - ¿Demuestra conocimiento real de las herramientas del puesto, o solo las "conoce de nombre"?
    
    2. 🔄 CONSISTENCIA ENTRE FUENTES:
       - ¿Hay CONTRADICCIONES entre CV, video, formulario y lo dicho en entrevista? (ej: años de experiencia, nivel de inglés, disponibilidad)
       - ¿El nivel de comunicación del video se mantiene en la entrevista, o era un video sobre-ensayado?
       - ¿Cambió de posición sobre condiciones laborales (salario, monitoreo, horarios) vs lo declarado en el formulario?
    
    3. 🎯 AJUSTE DE SCORE:
       - SUBE (+10 a +20): Si demuestra MÁS conocimiento/experiencia de lo que el CV sugería, con ejemplos sólidos y actitud proactiva.
       - MANTIENE (±5): Si confirma el nivel del CV sin sorpresas, positivas o negativas.
       - BAJA (-10 a -30): Si respuestas vagas/inconsistencias revelan que el CV estaba inflado, o detectas banderas rojas nuevas (actitud, nivel técnico inferior, cambios de posición).
    
    4. 🚩 DETECCIÓN DE BANDERAS ROJAS:
       - Genera ALERTAS específicas si detectas: nivel de inglés inferior al declarado, inconsistencias sobre experiencia, cambios en disponibilidad/salario, respuestas evasivas sobre logros, actitud problemática, señales de doble empleo no declarado.
    
    --- CALIBRACIÓN DE TONO (usa estos ejemplos como guía) ---
    
    VALIDACIÓN POSITIVA (Score sube):
    - El candidato profundiza con ejemplos concretos que el CV no reflejaba bien
    - Demuestra dominio técnico real de herramientas clave del puesto
    - Actitud profesional y preparación evidente
    → Tono: "La entrevista valida y amplía el perfil. Demuestra [skill específico] con ejemplos detallados de [contexto]. Se eleva el score debido a profundidad técnica superior a lo reflejado en CV."
    
    CONFIRMACIÓN (Score mantiene):
    - La entrevista confirma lo analizado en CV y video
    - Sin inconsistencias relevantes ni sorpresas
    - Nivel técnico/actitudinal esperado
    → Tono: "La entrevista es consistente con el análisis previo. Sostiene el nivel declarado en [áreas clave]. Se mantiene el score."
    
    DETECCIÓN DE INFLADO (Score baja):
    - Respuestas vagas que no sostienen la experiencia del CV
    - Inconsistencias entre fuentes (CV vs entrevista)
    - Nivel técnico/inglés inferior al declarado
    - Banderas rojas nuevas detectadas
    → Tono: "La entrevista expone discrepancias con el CV. No pudo dar ejemplos concretos sobre [tema declarado]. [Mencionar inconsistencias específicas]. Se reduce el score."
    
    --- EJEMPLOS DE OUTPUT POR ÁREA (PATRONES DE REFERENCIA) ---
    
    [ÁREA TÉCNICA - Automatización/Desarrollo]
    {
      "score": 75,
      "motivos": "La entrevista supera las expectativas del CV. Aunque el CV presentaba descripciones básicas, demostró dominio avanzado de las herramientas clave del puesto (Make, Zapier) con ejemplos detallados de workflows implementados. Validó métricas del logro declarado (reducción 40% en tiempos) con contexto técnico sólido. El análisis previo del video sobre actitud profesional se confirma con preparación evidente. Score elevado +15 puntos por profundidad técnica demostrada.",
      "alertas": []
    }
    
    [ÁREA COMUNICACIÓN/GESTIÓN - RRHH/Marketing]
    {
      "score": 58,
      "motivos": "La entrevista confirma el perfil medio-bajo detectado en CV. Sostiene experiencia en procesos de reclutamiento con ejemplos coherentes pero sin métricas específicas de impacto. Las herramientas mencionadas (ATS básico, LinkedIn Recruiter) se validan con uso intermedio, no avanzado. Mantiene la estabilidad actitudinal del video. No hay inconsistencias graves entre fuentes. Score se mantiene como reflejo de un perfil que cumple mínimos sin destacarse.",
      "alertas": ["Experiencia limitada en estrategias de employer branding"]
    }
    
    [ÁREA ANALÍTICA - Contabilidad/Datos]
    {
      "score": 42,
      "motivos": "La entrevista revela brechas significativas con el CV. Aunque declara experiencia con software contable avanzado (QuickBooks, SAP), no pudo explicar procesos de conciliación bancaria ni elaboración de estados financieros cuando se le solicitó detalle. Las respuestas sobre manejo de cierres contables fueron genéricas sin demostrar conocimiento práctico. Se detecta inconsistencia en nivel de Excel (CV: avanzado, entrevista: intermedio básico). Score reducido -18 puntos por falta de profundidad técnica comprobable.",
      "alertas": ["Conocimiento superficial de software contable declarado", "Nivel de Excel inferior al declarado"]
    }
    
    --- SALIDA JSON ÚNICAMENTE ---
    
    Devuelve SOLO este JSON sin texto adicional:
    
    {
      "score": (0-100, ajustado según entrevista),
      "motivos": "Párrafo de 4-6 líneas que CONTRASTA las fuentes previas (CV + Video + Formulario) con la entrevista. Menciona: 1) Qué se validó, 2) Qué inconsistencias se detectaron, 3) Por qué el score cambió o se mantuvo, 4) Puntos específicos de la entrevista que fundamentan la decisión. Tono profesional y objetivo.",
      "alertas": ["Array de strings con banderas rojas específicas. Ejemplos: 'Nivel de inglés B1, no B2 declarado', 'No pudo profundizar en herramienta X del CV', 'Cambió posición sobre disponibilidad', 'Respuestas evasivas sobre logros específicos'"]
    }
    `;

    // 3. Ejecución IA
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    
    // Extracción segura de JSON
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    const analisis = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));

    // 4. Persistencia (Sobreescribimos para que la ficha quede actualizada)
    await docRef.update({
        ia_score: analisis.score,
        ia_motivos: analisis.motivos,
        ia_alertas: analisis.alertas || [],
        interview_analyzed: true,
        transcripcion_entrevista: transcript, // Guardar transcripción para el informe final
        actualizado_en: new Date().toISOString(),
        
        // HISTORIAL: Transcripción analizada
        historial_movimientos: admin.firestore.FieldValue.arrayUnion({
            date: new Date().toISOString(),
            event: 'Transcripción Analizada',
            detail: `Análisis post-entrevista completado. Nuevo score: ${analisis.score}/100`,
            usuario: req.body.responsable || 'Sistema'
        })
    });

    res.json({ ok: true, ...analisis });

  } catch (e) {
    console.error("Error re-analizando entrevista:", e);
    res.status(500).json({ error: e.message });
  }
});
// ==========================================
// 🔍 ENDPOINT: ANÁLISIS MANUAL DE CANDIDATO (CARGA MANUAL)
// ==========================================
app.post("/candidatos/:id/analizar", async (req, res) => {
  try {
    const { id } = req.params;
    const responsable = req.body.responsable || req.body.usuario_accion || "Admin";

    // 1. Obtener candidato de Firestore
    const docRef = firestore.collection(MAIN_COLLECTION).doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Candidato no encontrado" });
    }

    const candidato = docSnap.data();

    // 2. Validar que tenga texto extraído del CV
    if (!candidato.texto_extraido) {
      return res.status(400).json({ error: "El candidato no tiene texto de CV extraído" });
    }

    // 3. Generar reseña del CV si no existe
    let reseñaCV = candidato.reseña_cv;
    if (!reseñaCV) {
      console.log("📝 Generando reseña del CV...");
      reseñaCV = await generarResenaCV(candidato.texto_extraido, candidato.puesto || "General");
    }

    // 4. Preparar datos para el análisis (incluir respuestas_filtro si existen)
    const datosParaAnalisis = candidato.respuestas_filtro 
      ? JSON.stringify(candidato.respuestas_filtro)
      : "";

    // 5. Ejecutar análisis IA usando verificaConocimientosMinimos
    console.log("🤖 Ejecutando análisis IA manual...");
    const analisisIA = await verificaConocimientosMinimos(
      candidato.puesto || "General",
      candidato.texto_extraido, // Texto del CV
      datosParaAnalisis, // Respuestas del filtro (Datos Clave y Skills) como JSON string
      reseñaCV, // Reseña del CV
      null // No hay video en análisis manual inicial
    );

    // Limitar score inicial a máximo 70 para carga manual (antes de la entrevista)
    analisisIA.score = Math.min(analisisIA.score, 70);

    // 6. Actualizar candidato en Firestore
    await docRef.update({
      ia_score: analisisIA.score,
      ia_motivos: analisisIA.motivos || "Análisis manual completado",
      ia_alertas: analisisIA.alertas || [],
      ia_status: "processed",
      reseña_cv: reseñaCV,
      actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
      
      // HISTORIAL: Análisis manual realizado
      historial_movimientos: admin.firestore.FieldValue.arrayUnion({
        date: new Date().toISOString(),
        event: 'Análisis Manual',
        detail: `Análisis manual completado. Score: ${analisisIA.score}/100`,
        usuario: responsable
      })
    });

    console.log(`✅ Análisis manual completado para candidato ${id} - Score: ${analisisIA.score}`);
    res.json({ 
      ok: true, 
      score: analisisIA.score,
      motivos: analisisIA.motivos,
      alertas: analisisIA.alertas || [],
      reseña_cv: reseñaCV
    });

  } catch (e) {
    console.error("Error en análisis manual:", e);
    res.status(500).json({ error: e.message });
  }
});
// ==========================================
// 🎣 WEBHOOK ZOHO FORM 2: VALIDACIÓN TÉCNICA (CONECTADO)
// ==========================================
app.post("/webhook-form2", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 [Webhook Form 2] Datos recibidos:", JSON.stringify(data));
    await registrarEstadoWebhook("zoho_form2", true); // Registro de ejecución exitosa

    // 1. Normalizar Email (Es la llave que configuramos en Zoho)
    const emailCandidate = (data.email || data.Email || "").trim().toLowerCase();
    
    if (!emailCandidate) {
        console.error("❌ Form 2 recibido SIN email. Imposible asociar.");
        return res.status(400).send("Falta el campo email para identificar al candidato.");
    }

    // 2. Buscar al candidato en la base de datos (CVs_staging)
    const snapshot = await firestore.collection(MAIN_COLLECTION)
        .where('email', '==', emailCandidate)
        .limit(1)
        .get();

    if (snapshot.empty) {
        console.warn(`⚠️ Webhook recibido pero no encontré candidato con email: ${emailCandidate}`);
        // Respondemos 200 a Zoho para que no se quede reintentando infinitamente
        return res.status(200).send("Candidato no encontrado en DB.");
    }

    const doc = snapshot.docs[0];
    
    // 3. Guardar las respuestas
    // Guardamos todo el objeto 'data' porque ya hiciste el trabajo duro de mapear
    // los nombres bonitos (herramienta_1, nivel_1, etc.) en Zoho.
    await doc.ref.update({
        process_step_2_form: 'received',  // 🔥 Enciende el semáforo VERDE
        respuestas_form2: {
            fecha_recepcion: new Date().toISOString(),
            data: data // Aquí va todo el paquete limpio que configuraste
        },
        actualizado_en: new Date().toISOString(),
        
        // HISTORIAL: Respuestas del Zoho 2 recibido
        historial_movimientos: admin.firestore.FieldValue.arrayUnion({
            date: new Date().toISOString(),
            event: 'Respuestas del Zoho 2 Recibido',
            detail: 'El candidato completó la validación técnica (Zoho Form 2)',
            usuario: 'Sistema (Zoho)'
        })
    });

    console.log(`✅ [Webhook Form 2] Respuestas guardadas para: ${emailCandidate}`);
    await registrarEstadoWebhook("zoho_form2", true); // Confirmación final de éxito
    res.status(200).send("Recibido y procesado exitosamente.");

  } catch (error) {
    console.error("❌ Error procesando Webhook Form 2:", error);
    await registrarEstadoWebhook("zoho_form2", false, error.message); // Registro de error
    res.status(500).send("Error interno del servidor");
  }
});

// ==========================================
// 🔥 ENDPOINT DE CONFIGURACIÓN FIREBASE (PÚBLICO)
// ==========================================
app.get("/firebase-config", (req, res) => {
  // Configuración pública para el cliente de Firebase Auth
  // Estas variables deben estar en .env: FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || ""
  });
});

// ==========================================
// 🚀 INICIO DEL SERVIDOR (CON BUCLE AUTOMÁTICO)
// ==========================================
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`✅ Servidor activo en http://0.0.0.0:${PORT}`);
  console.log("🔎 Inicializando Firebase...");

  // Validación de entorno
  const resolved = process.env.FIREBASE_STORAGE_BUCKET;
  if (!resolved) {
    console.error("❌ Falta FIREBASE_STORAGE_BUCKET en el archivo .env");
    return;
  }

  // Inicialización global
  try {
      firestore = admin.firestore();
      bucket = admin.storage().bucket();
      console.log(`🪣 Bucket en uso: ${bucket.name}`);

      // Verificamos conexión
      STORAGE_READY = await storageProbe();
      
      if (!STORAGE_READY) {
        console.warn("⚠️ Storage no respondió correctamente, pero el servidor seguirá activo.");
      } else {
        console.log("✅ Storage OK — sistema operativo");
      }
      
  } catch (error) {
      console.error("❌ Error fatal inicializando servicios de Firebase:", error);
  }

  // 🔥 LA CORRECCIÓN: CICLO INFINITO 🔥
  console.log("🔌 Iniciando servicio de lectura de correos (Ciclo Automático)...");
  
  // SEMÁFORO: Evita que se solapen los procesos si uno tarda mucho
  let isProcessing = false;

  // 1. Ejecutar inmediatamente al arrancar para no esperar
  analizarCorreos(); 
  
  // 2. Programar repetición cada 120 segundos (120000 ms)
  setInterval(async () => {
      if (isProcessing) {
          console.log("⚠️ Saltando ciclo: El proceso anterior todavía no terminó.");
          return;
      }

      isProcessing = true; // 🔴 Bloquear semáforo
      console.log("⏰ Ciclo programado: Buscando nuevos correos...");
      
      try {
          await analizarCorreos();
      } catch (error) {
          console.error("❌ Error crítico en el ciclo:", error);
      } finally {
          isProcessing = false; // 🟢 Liberar semáforo (siempre)
      }
  }, 120000); 
});
