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
const axios = require("axios");
const vision = require("@google-cloud/vision");
const crypto = require("node:crypto");
const { Storage } = require("@google-cloud/storage");
const pLimit = require("p-limit");        // concurrencia
const helmet = require("helmet");         // seguridad
const rateLimit = require("express-rate-limit");
const verifyToken = require("./authMiddleware");
const mammoth = require("mammoth");
const { v4: uuidv4 } = require("uuid");
const tempBase = path.join(os.tmpdir(), "cvs-en-proceso");
const PYTHON_BIN = process.env.PYTHON_BIN || "python";

const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, BorderStyle, TextRun, AlignmentType, ImageRun } = require("docx");

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
            "https://generativelanguage.googleapis.com"
        ],
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
  "/contratados",
  "/descartar",
  "/descartados",
  "/en-proceso",
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
  // QUITAMOS "en_proceso" para que aparezcan en el buscador
  const colecciones = ["contratados", "descartados"]; 
  const bloqueados = new Set();

  for (const col of colecciones) {
    const snap = await firestore.collection(col).get();
    snap.forEach((doc) => {
      bloqueados.add(doc.id.trim().toLowerCase());
    });
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



//////////////////////////////////////////////////////////////////
async function mapAreaToFolder(areaReal = "") {
  const categoriasPrincipales = [
    "Administración",
    "Financiero y Contable",
    "Ventas y Comercio Electrónico",
    "Marketing Digital",
    "Comunicaciones",
    "Arquitectura",
    "Diseño Gráfico",
    "Desarrollo Web",
    "Gestión y Calidad",
    "Automatizaciones e IA",
    "Recursos Humanos",
    "Edición Audiovisual"
  ];

  const ejemplos = {
    "Administración": [
      "Asistente Administrativo",
      "Asistente Virtual",
      "Atención al cliente",
      "Project Manager",
      "Control documental"
    ],
    "Financiero y Contable": [
      "Contabilidad",
      "Auditoría",
      "Nómina",
      "Analista financiero"
    ],
    "Ventas y Comercio Electrónico": [
      "Ventas",
      "E-commerce",
      "Customer Success",
      "Relaciones comerciales",
      "Asesor comercial"
    ],
    "Marketing Digital": [
      "SEO",
      "Community Manager",
      "Growth",
      "Copywriter",
      "Publicidad"
    ],
    "Comunicaciones": [
      "Relaciones públicas",
      "Redacción",
      "Comunicación corporativa"
    ],
    "Arquitectura": [
      "Delineante",
      "Tasaciones",
      "Ingeniero de caminos"
    ],
    "Diseño Gráfico": [
      "UX/UI",
      "Branding",
      "Motion Graphics",
      "Diseño de producto"
    ],
    "Desarrollo Web": [
      "Desarrollador",
      "Frontend",
      "Backend",
      "Full stack",
      "QA tester",
      "CMS"
    ],
    "Gestión y Calidad": [
      "Calidad",
      "Auditoría interna",
      "PMO",
      "SOP"
    ],
    "Automatizaciones e IA": [
      "RPA",
      "IA",
      "Chatbots",
      "Zoho",
      "Zapier",
      "Make",
      "Integraciones"
    ],
    "Recursos Humanos": [
      "Reclutador",
      "Seleccionador",
      "Generalista",
      "People"
    ],
    "Edición Audiovisual": [
      "Edición de video",
      "Producción",
      "Motion graphics",
      "Contenido para redes"
    ]
  };

  const prompt = `
Clasifica el área del candidato en UNA de las siguientes 12 categorías principales.

AREA DEL CANDIDATO:
"${areaReal}"

CATEGORÍAS PRINCIPALES:
${JSON.stringify(categoriasPrincipales, null, 2)}

EJEMPLOS:
${JSON.stringify(ejemplos, null, 2)}

REGLAS:
- No inventes categorías nuevas.
- Si el área es desconocida, clasifica por similitud semántica.
- Si no encaja en ninguna, devuelve "Otros".
- Responde SOLO en este JSON:
{"categoria": "Nombre"}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Devuelve únicamente JSON válido" },
        { role: "user", content: prompt }
      ],
    });

    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");

    const cat = parsed?.categoria || "";

    if (categoriasPrincipales.includes(cat)) return cat;
    return "Otros";

  } catch (err) {
    console.error("⚠️ Error en mapAreaToFolder:", err.message);
    return "Otros";
  }
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

      // 6. SUBIR A STORAGE (Arregla el Link)
      const bucketFile = bucket.file(`CVs_staging/files/${safeId}_CV.pdf`);
      await bucketFile.save(pdfAttachment.content, { metadata: { contentType: "application/pdf" } });
      const [publicCvUrl] = await bucketFile.getSignedUrl({ action: 'read', expires: '01-01-2035' });
      console.log("📤 Link generado correctamente.");

      // 7. RECUPERAR DATOS DEL WEBHOOK
      const docRef = firestore.collection("CVs_staging").doc(safeId);
      const docSnap = await docRef.get();
      
      let datosZoho = { respuestas_filtro: {} };
      if (docSnap.exists) datosZoho = docSnap.data();
      else {
          // Fallback por si el mail llega antes que el webhook
          await docRef.set({ id: safeId, email: candidatoEmail, nombre: "Candidato (Mail)", origen: "mail_first" }, { merge: true });
      }

      // 8. LEER TEXTO DEL PDF (CRÍTICO: Aquí leemos el CV real)
      let pdfText = "";
      try {
          const pdfData = await pdfParse(pdfAttachment.content);
          pdfText = pdfData.text.slice(0, 20000); // Leemos hasta 20k caracteres
      } catch (e) { console.error("Error leyendo PDF:", e.message); }

      // 9. IA CALIBRADA (Cruce de Datos: Formulario vs PDF)
      console.log("🤖 Calibrando Score (Formulario vs PDF)...");
      const prompt = `
        ACTÚA COMO: Reclutador Senior.
        TAREA: Calibrar Score cruzando respuestas del formulario con el CV real.

        1. RESPUESTAS FORMULARIO (Zoho):
        ${JSON.stringify(datosZoho.respuestas_filtro || "Vacio")}

        2. CV REAL (PDF):
        ${pdfText || "Sin texto"}

        REGLAS DE CALIBRACIÓN:
        - Si el formulario es vago pero el CV es fuerte -> Score 70-80.
        - Si el formulario miente (dice experto y el CV no lo muestra) -> Score 0-40.
        - Si rechaza Salario/Monitoreo en el formulario -> Score 0.
        - Si ambos son fuertes -> Score 90-100.

        SALIDA JSON: { "score": number, "motivos": "string", "alertas": ["string"] }
      `;

      let analisisIA = { score: 50, motivos: "Pendiente", alertas: [] };
      try {
          const result = await model.generateContent(prompt);
          const responseText = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
          const jsonString = responseText.substring(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1);
          analisisIA = JSON.parse(jsonString);
      } catch (e) { 
          console.error("Error IA:", e.message); 
      }

      // 10. ACTUALIZAR BASE DE DATOS (Master Update)
      // Usamos .set con { merge: true } para asegurarnos de crear el 'stage' si no existe
      await docRef.set({
        cv_url: publicCvUrl,
        tiene_pdf: true,
        ia_score: analisisIA.score,
        ia_motivos: analisisIA.motivos,
        ia_alertas: analisisIA.alertas || [],
        ia_status: "processed",
        
        // 🔥 ESTO ES LO QUE FALTABA: La etiqueta para el Frontend
        stage: datosZoho.stage || 'stage_1', 
        status_interno: datosZoho.status_interno || 'new',
        
        actualizado_en: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }); // 'merge: true' cuida de no borrar el nombre ni el email

    console.log(`✅ [OK] ${safeId} actualizado. Score Final: ${analisisIA.score}`);
    await processedRef.set({ uid, status: "success", safeId, fecha: admin.firestore.FieldValue.serverTimestamp() });
  }
} catch (error) {
  console.error("❌ Error en analizarCorreos:", error);
} finally {
  if (client) await client.logout();
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

      const { q = "", desde = null, hasta = null } = req.query;

      

      console.log(`📡 Solicitud de búsqueda recibida. Query: "${q}"`);

  

      // USAMOS LA VARIABLE MAESTRA
      let ref = admin.firestore().collection(MAIN_COLLECTION);

      const snap = await ref.orderBy('creado_en', 'desc').limit(100).get();
      

      if (snap.empty) return res.json({ resultados: [] });

  

      const bloqueados = await obtenerCandidatosBloqueados();

      const termino = q.toLowerCase().trim();

      

      // 1. Mapeo Inteligente con Fecha Unificada

      let candidatos = snap.docs.map(doc => {

        const data = doc.data();

        

        // --- LÓGICA DE ORDENAMIENTO ---

        // Buscamos cualquier fecha disponible para que nadie se quede sin ordenar

        let timestamp = 0;



        if (data.fecha_correo) {

            // Prioridad 1: Fecha real del correo

            timestamp = new Date(data.fecha_correo).getTime();

        } else if (data.creado_en) {

            // Prioridad 2: Fecha de creación en base de datos (Soporta Timestamp de Firebase)

            timestamp = data.creado_en.toDate ? data.creado_en.toDate().getTime() : new Date(data.creado_en).getTime();

        } else if (data.fecha) {

            // Prioridad 3: Fecha genérica

            timestamp = new Date(data.fecha).getTime();

        }



        // Recuperamos datos visuales

        const nombreFinal = data.nombre || data.datos_personales?.nombre_completo || data.applicant_email || "Sin Nombre";

        const linkFinal = data.cv_url || data.cv_storage_path || null;

  

        return {

          id: doc.id,

          nombre: nombreFinal,

          email: data.email || data.applicant_email || "S/E",

          puesto: data.puesto || "Sin puesto",

          cv_url: linkFinal,

          fecha_orden: timestamp, // <--- Usaremos esto para ordenar

          ia_score: data.ia_score || 0,

          // 🔥 AGREGA ESTA LÍNEA AQUÍ 👇
    ia_motivos: data.ia_motivos || data.motivo || "Análisis pendiente...", 
    video_url: data.video_url || null, 
  respuestas_filtro: data.respuestas_filtro || {},
    motivo: data.motivo || "",
    experiencia_resumen: data.experiencia ? JSON.stringify(data.experiencia).slice(0, 100) : ""
  };
})

      .filter(c => {

        // 2. Filtrado por texto

        if (bloqueados.has(c.id.toLowerCase())) return false;

        if (!termino) return true; // Si no escribiste nada, devuelve todo

  

        const matchText = `${c.nombre} ${c.email} ${c.puesto}`.toLowerCase();

        return matchText.includes(termino);

      });

  

      // 3. ORDENAMIENTO FINAL (El número más grande = fecha más reciente = va primero)

      candidatos.sort((a, b) => b.fecha_orden - a.fecha_orden);

  

      console.log(`✅ Enviando ${candidatos.length} candidatos ordenados.`);

      res.json({ resultados: candidatos });

  

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

        return res.json(informeManual); // Enviamos directo al dashboard sin guardar en DB
    }

    // --- CASO 2: PROCESO IDEAL (Candidatos del Pipeline) ---
    const docRef = firestore.collection("CVs_aprobados").doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        return res.status(404).json({ error: "Candidato no encontrado en el pipeline." });
    }

    const data = doc.data();
    
    // Si ya existe un informe guardado y no pedimos regenerar, lo devolvemos
    if (data.informe_final_data && (!manualData || !manualData.forceRegenerate)) {
        console.log("📄 Devolviendo informe ya existente desde Firestore.");
        return res.json(data.informe_final_data);
    }

    // Si no hay informe, lo generamos usando los datos de Firestore
    const textoCV = manualData?.textoCV || data.texto_extraido || "";
    const notas = manualData?.notas || data.motivo || "";

    const informeGenerado = await generarDatosParaInforme(
        textoCV,
        data.puesto || data.oferta || "Candidato",
        notas,
        data.respuestas_form_2 || {},
        data.analisis_ia || "",
        responsable || "Admin"
    );

    if (informeGenerado) {
        // Guardamos el informe en Firestore para que ya quede entrelazado
        await docRef.update({ 
            informe_final_data: informeGenerado,
            report_generated: true 
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
/////// ENDPOINT: Obtener motivos de los candidatos (mejorado)///7

app.get('/motivos', async (req, res) => {
  try {
    const { nombre = '', estado = '' } = req.query;

    // Usa admin.firestore() directamente
    let query = admin.firestore().collection('cv_revisados');

    // Filtrar por estado si se especifica
    if (estado) {
      query = query.where('estado', '==', estado);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      return res.json([]);
    }

    const motivos = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      // 🔍 Búsqueda más flexible: por correo, nombre_archivo, area, o dentro del texto del motivo
      const textoBusqueda = nombre.toLowerCase();

      const coincide =
        !nombre ||
        (data.applicant_email &&
          data.applicant_email.toLowerCase().includes(textoBusqueda)) ||
        (data.nombre &&
          data.nombre.toLowerCase().includes(textoBusqueda)) ||
        (data.nombre_archivo &&
          data.nombre_archivo.toLowerCase().includes(textoBusqueda)) ||
        (data.area &&
          data.area.toLowerCase().includes(textoBusqueda)) ||
        (data.motivos &&
          data.motivos.toLowerCase().includes(textoBusqueda)) ||
        (data.ia?.motivos &&
          data.ia.motivos.toLowerCase().includes(textoBusqueda));

      if (coincide) {
        motivos.push({
          id: doc.id,
          nombre:
            data.nombre_archivo ||
            data.applicant_email ||
            data.nombre ||
            'Desconocido',
          estado: data.estado || 'sin_estado',
          motivos:
            data.motivo ||
            data.ia?.motivos ||
            data.motivos ||
            'Sin motivo registrado',
          fecha:
            data.fecha ||
            data.createdAt ||
            (data.timestamp ? data.timestamp.toDate() : null) ||
            '',
        });
      }
    });

    // Ordenar por fecha (más recientes primero)
    motivos.sort(
      (a, b) =>
        new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime()
    );

    res.json(motivos);
  } catch (error) {
    console.error('❌ Error obteniendo motivos:', error);
    res
      .status(500)
      .json({ error: 'Error al obtener los motivos de revisión' });
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

// 🔹 Obtiene los nombres de archivos ya clasificados en Firestore
async function obtenerNombresArchivados() {
  const colecciones = ['en_proceso', 'contratados', 'descartados', 'favoritos'];
  const nombres = new Set();

  for (const col of colecciones) {
    const snap = await firestore.collection(col).get(); // 🔹 usa tu instancia global de Firestore
    if (snap.empty) continue;

    snap.forEach(doc => {
      const data = doc.data();

      // Campo normal
      if (data.nombre_archivo) {
        nombres.add(data.nombre_archivo.trim().toLowerCase());
      }

      // Caso especial: colección "favoritos" (array de cvs)
      if (Array.isArray(data.cvs)) {
        data.cvs.forEach(nombre => {
          if (nombre && typeof nombre === 'string') {
            nombres.add(nombre.trim().toLowerCase());
          }
        });
      }
    });
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
  limits: { fileSize: 16 * 1024 * 1024 }
});
const { execFile } = require("child_process");
const TEMPLATE_PATH = process.env.FICHA_TEMPLATE_PATH
  || path.join(__dirname, "plantillas", "Ficha_Template.docx");

function makeTmpDir(prefix = "ficha-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

function countLines(s = '') {
  return (String(s).match(/\n/g) || []).length + (s ? 1 : 0);
}


function printLarge(label, s = '', preview = 1000) {
  console.log(label, {
    chars: s.length,
    lines: countLines(s),
    preview: s.slice(0, preview)
  });
}

app.post("/ficha_subida", upload.single("cv"), async (req, res) => {
  console.log("\n=== [/ficha_subida] INICIO ===");

  console.log("[REQ.body]", {
    keys: Object.keys(req.body || {}),
    conLogo: req.body?.conLogo,
    textoPegado_len: (req.body?.textoPegado || "").length,
  });

  console.log("[REQ.file]", {
    fieldname: req.file?.fieldname,
    originalname: req.file?.originalname,
    mimetype: req.file?.mimetype,
    path: req.file?.path,
    size: req.file?.size,
  });

  if (!STORAGE_READY) {
    return res.status(503).json({ error: "Storage no disponible." });
  }

  // 🛡️ AIRBAG: Si el usuario no escribe nada, enviamos un texto por defecto
  // para evitar que el script de Python falle por "texto vacío".
  const textoPegado = (req.body?.textoPegado || "").trim() || "Informe generado sin notas adicionales del reclutador.";

  // Separamos esta línea para que quede ordenado
  const conLogo = String(req.body?.conLogo || "true").toLowerCase() !== "false";
  const file = req.file;

  if (!file?.path || !file?.originalname) {
    return res.status(400).json({ error: "Falta el archivo PDF ('cv')." });
  }

  const tmpToClean = [];
  const cleanAll = () => tmpToClean.forEach(safeUnlink);

  try {
    // Crear carpeta temporal
    const tmpDir = makeTmpDir("ficha-up-");
    tmpToClean.push(tmpDir);

    const extraTxtPath = path.join(tmpDir, "extra.txt");
    fs.writeFileSync(extraTxtPath, textoPegado || "", "utf8");

    // Carpeta de salida para el DOCX
    const outdir = makeTmpDir("ficha-out-");
    tmpToClean.push(outdir);

    // Nombre base del archivo (sin extensión)
    const baseRaw = path.basename(file.originalname).replace(/\.pdf$/i, "");
    const base = baseRaw.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);

    // Construir argumentos EXACTOS que ficha2.py espera
    const PYTHON_BIN = process.env.PYTHON_BIN || "python";

    const args = [
      path.join(__dirname, "ficha2.py"),
      "--outdir", outdir,
      "--basename", base,
      "--extra_file", extraTxtPath,
      "--cv", file.path
    ];

    // Añadir logo si corresponde
    if (conLogo) {
      const logoPath = path.join(__dirname, "logo.png");
      if (fs.existsSync(logoPath)) args.push("--logo", logoPath);
    }

    console.log("[EJECUTANDO Python]", { PYTHON_BIN, args });

    const execOpts = {
      cwd: __dirname,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    };

    // Ejecutar Python
    await new Promise((resolve) => {
      const child = child_process.spawn(PYTHON_BIN, args, execOpts);
      let stdout = "",
        stderr = "";

      child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
      child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

      child.on("close", async (code) => {
        console.log("[ficha2.py exit]", { code, stderr });

        try {
          if (code !== 0) throw new Error("ficha2.py no terminó OK");

          const result = JSON.parse(stdout || "{}");

          const localDocx = result.docx && fs.existsSync(result.docx)
            ? result.docx
            : null;

          if (!localDocx) {
            cleanAll();
            return res.status(500).json({ error: "No se generó el archivo .docx." });
          }

          // Subir DOCX a Firebase
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const dest = `fichas-generadas/${base}/${ts}/${path.basename(localDocx)}`;

          await bucket.upload(localDocx, {
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

          cleanAll();

          return res.json({
            message: "✅ Ficha generada (Word)",
            url: urlDocx,
            storagePath: dest,
          });

        } catch (e) {
          console.error("[ERROR procesando salida ficha2.py]", e);
          cleanAll();
          return res.status(500).json({ error: "Error generando la ficha." });
        }

        resolve();
      });
    });

  } catch (e) {
    console.error("[ERROR interno /ficha_subida]", e);
    cleanAll();
    return res.status(500).json({ error: "Error interno del servidor." });
  }
});



app.post('/ficha_recibida', async (req, res) => {
  console.log('== [/ficha_recibida] INICIO ===');
  try {
    const { textoPegado, nombreCV, conLogo } = req.body || {};
    if (!nombreCV) return res.status(400).json({ error: 'Falta el nombre del CV.' });

    // Limpieza y normalización del nombre
    const cleanName = nombreCV.trim().toLowerCase().replace(/\s+/g, ' ');
    console.log('[REQ.body]', { textoPegado_preview: textoPegado?.slice(0, 200), nombreCV });

    // Crear carpeta temporal
    const tmpDir = makeTmpDir('ficha-recibida-');
    console.log('[Temp dir creado]', { tmpDir });

    const bucket = getStorage().bucket();
    const searchPrefix = `${ROOT_PREFIX}`; // Buscar en todo el prefijo raíz (no solo cv-subidos)
    console.log('[Buscando en prefijo]', { searchPrefix });

    // 🔹 Buscar TODOS los archivos PDF dentro del prefijo
    const [files] = await bucket.getFiles({ prefix: searchPrefix });
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));

    // 🔹 Normalizar nombres para comparación flexible
    const normalize = s =>
      s.toLowerCase()
        .replace(/[_\-\.]+/g, ' ') // reemplaza guiones, underscores y puntos
        .replace(/\.pdf$/, '')     // quita extensión
        .trim();

    // 🔹 Buscar coincidencia más cercana
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
      console.error('[ERROR] No se encontró archivo que coincida con', nombreCV);
      return res.status(404).json({
        error: `No se encontró ningún PDF en Storage que coincida con "${nombreCV}".`
      });
    }

    console.log('[Archivo encontrado]', { matchedName: matchedFile.name });

    // Descargar el archivo
    const tmpPdfPath = path.join(tmpDir, path.basename(matchedFile.name));
    await matchedFile.download({ destination: tmpPdfPath });
    console.log('[Descarga completada]', { tmpPdfPath });

    // Escribir el texto adicional
    const extraTxtPath = path.join(tmpDir, 'extra.txt');
    fs.writeFileSync(extraTxtPath, textoPegado || '');
    console.log('[Extra escrito]', { extraTxtPath });

    // Crear carpeta de salida
    const outDir = makeTmpDir('ficha-out-');

    // Ejecutar Python
    const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
    const args = [
      path.join(__dirname, 'ficha.py'),
      '--outdir', outDir,
      '--basename', path.basename(matchedFile.name, '.pdf'),
      '--cv', tmpPdfPath,
      '--extra_file', extraTxtPath,
      '--no-pdf'
    ];

    if (conLogo) {
      const logoPath = path.join(__dirname, 'logo.png');
      if (fs.existsSync(logoPath)) args.push('--logo', logoPath);
    }

    console.log('[EJECUTANDO Python]', { PYTHON_BIN, args });

    const { spawn } = require('child_process');
    const child = spawn(PYTHON_BIN, args, { cwd: __dirname, env: process.env });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));

    child.on('close', async code => {
      if (code !== 0) {
        console.error('[ERROR Python]', { code, stderr });
        return res.status(500).json({ error: 'Error al generar la ficha (Python falló).' });
      }

      console.log('[Python completado OK]');
      const docxFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.docx'));
      if (docxFiles.length === 0) {
        return res.status(500).json({ error: 'No se generó ningún archivo .docx.' });
      }

      const finalDocxPath = path.join(outDir, docxFiles[0]);
      const destName = `fichas-generadas/${Date.now()}-${docxFiles[0]}`;
      const destFile = bucket.file(destName);
      await bucket.upload(finalDocxPath, { destination: destName });
      console.log('[DOCX subido al bucket]', { destName });

      // URL firmada para descarga y previsualización
      const [url] = await destFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000
      });

      res.json({ url });
    });
  } catch (e) {
    console.error('[ERROR interno /ficha_recibida]', { e, stack: e.stack });
    res.status(500).json({ error: e.message || 'Error interno en /ficha_recibida' });
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






//////////////////////// botones para mover entre listas ///////////////////////////////////

/////////////////////////////////////  LISTAS: en_proceso / contratados / descartados  ////////////////////////
const LIST_COLLECTIONS = ["en_proceso", "contratados", "descartados"];

function ensureListName(name) {
  if (!LIST_COLLECTIONS.includes(name)) {
    throw new Error(`Lista inválida: ${name}`);
  }
  return name;
}

/**
 * GET /listas
 * query:
 * - lista (opcional)
 */
app.get("/listas", async (req, res) => {
  try {
    const { lista } = req.query;

    const listasAConsultar = lista
      ? [ensureListName(lista)]
      : LIST_COLLECTIONS;

    const resultado = {};

    for (const col of listasAConsultar) {
      const snap = await firestore.collection(col).get();
      const items = [];

      snap.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          nombre: data.nombre_archivo || data.nombre || data.applicant_email,
          oferta: data.oferta || data.area,
          correo: data.applicant_email,
          lista: col,
          motivo: data.motivo || null,
          fecha: data.fecha || data.fecha_correo || null,
          movido_por: data.movido_por || null,
          movido_en: data.movido_en || null,
        });
      });

      resultado[col] = items;
    }

    res.json(resultado);
  } catch (err) {
    console.error("❌ GET /listas:", err);
    res.status(500).json({ error: "Error obteniendo listas" });
  }
});

// * POST /listas/mover
// * Mueve candidato entre listas y registra usuario que movió.
app.post("/listas/mover", async (req, res) => {
  try {
    const { id, from, to, motivo = "", usuario = "" } = req.body;

    if (!id || !from || !to) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    const fromCol = ensureListName(from);
    const toCol = ensureListName(to);

    // --- CAMBIO CLAVE AQUÍ ---
    // En lugar de usar serverTimestamp (que da problemas al leer),
    // usamos una fecha de texto universal (ISO) que el navegador entiende perfecto.
    const nowISO = new Date().toISOString();
    // -------------------------

    const refFrom = firestore.collection(fromCol).doc(id);
    const snap = await refFrom.get();

    let data = {};

    if (snap.exists) {
      // Caso normal: el candidato YA existe.
      if (fromCol === toCol) {
        return res.status(400).json({ error: "Origen y destino iguales" });
      }
      data = snap.data();
    } else {
      // Caso Gestión Manual: creamos registro mínimo.
      data = {
        id,
        nombre_archivo: id,
        creado_desde: "manual",
        creado_en: nowISO, // Usamos la fecha texto
      };
    }

    const newData = {
      ...data,
      origen_lista: fromCol,
      movido_por: usuario || "desconocido",
      movido_en: nowISO,      // ✅ Fecha texto (arregla el Invalid Date)
      actualizado_en: nowISO, // ✅ Fecha texto
    };

    // Si destino es descartados, requiere motivo
    if (toCol === "descartados") {
      if (!motivo.trim()) {
        return res.status(400).json({ error: "Motivo requerido" });
      }
      newData.motivo = motivo.trim();
    }

    // Si destino es contratados, registrar fecha
    if (toCol === "contratados" && !newData.fecha_contratacion) {
      newData.fecha_contratacion = nowISO;
    }

    const historialPrevio = Array.isArray(data.historial_movimientos)
      ? data.historial_movimientos
      : [];

    // Historial de movimientos
    newData.historial_movimientos = [
      ...historialPrevio,
      {
        usuario: usuario || "desconocido",
        de: fromCol,
        a: toCol,
        motivo: toCol === "descartados" ? motivo.trim() : null,
        fecha: nowISO, // ✅ Fecha texto para el historial también
      },
    ];

    // Guardamos en la lista destino
    await firestore.collection(toCol).doc(id).set(newData, { merge: true });

    // Borramos de la lista origen si existía
    if (snap.exists) {
      await refFrom.delete();
    }

    res.json({
      ok: true,
      id,
      from: fromCol,
      to: toCol,
      creadoDesdeManual: !snap.exists,
    });
  } catch (err) {
    console.error("❌ POST /listas/mover:", err);
    res.status(500).json({ error: "Error moviendo candidato" });
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
  const estados = ["en_proceso", "contratados", "descartados"];
  const movidos = new Set();

  for (const est of estados) {
    const snap = await firestore.collection(est).get();
    snap.forEach(d => movidos.add(d.id));
  }

  return movidos;
}


app.get("/resumen/:id", async (req, res) => {
  try {
    const id = req.params.id;
    // Buscamos en la colección correcta 'CVs_aprobados'
    const snap = await firestore.collection("CVs_aprobados").doc(id).get();
    
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
       🔵 MÉTRICAS FINALES
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
       🔵 1. LEER APROBADOS / RECHAZADOS DESDE cv_revisados
       =========================================================== */

    const revisadosSnap = await firestore.collection("cv_revisados").get();

    revisadosSnap.forEach((doc) => {
      const data = doc.data();
      if (!data) return;

      const estado = (data.estado || "").toLowerCase();

      if (estado === "aprobado") totals.aprobados++;
      if (estado === "rechazado") totals.rechazados++;

      const fechaRef = data.fecha_movimiento || data.creado_en;
      if (!fechaRef) return;

      const fecha = fechaRef.toDate().toISOString().split("T")[0];

      if (!porDia[fecha]) {
        porDia[fecha] = {
          enProceso: 0,
          contratados: 0,
          descartados: 0,
          aprobados: 0,
          rechazados: 0,
        };
      }

      if (estado === "aprobado") porDia[fecha].aprobados++;
      if (estado === "rechazado") porDia[fecha].rechazados++;
    });

    /* ===========================================================
       🔵 2. LEER LISTAS REALES
       =========================================================== */

    const enProcesoSnap = await firestore.collection("en_proceso").get();
    const contratadosSnap = await firestore.collection("contratados").get();
    const descartadosSnap = await firestore.collection("descartados").get();

    totals.enProceso = enProcesoSnap.size;
    totals.contratados = contratadosSnap.size;
    totals.descartados = descartadosSnap.size;

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
async function generarDatosParaInforme(textoCV, puesto, notas, form2, analisisPrevio, responsable) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Actúa como un Consultor Senior de RRHH y Redactor de Informes Corporativos.
      Tu misión es transformar notas crudas (a veces vagas o desordenadas) en un INFORME EJECUTIVO ESTRUCTURADO Y PROFESIONAL.

      --- FUENTES DE INFORMACIÓN ---
      1. **NOTAS DEL RECLUTADOR (PRIORIDAD TOTAL - 90%):** "${notas}"
         *Instrucción:* Estas notas contienen la verdad sobre el candidato. Extrae de aquí: nivel de inglés real, disponibilidad, skills técnicas validadas y habilidades blandas observadas. Si el texto es un párrafo corrido, DESGLÓSALO.

      2. **CV DEL CANDIDATO (APOYO - 10%):** "${textoCV.slice(0, 20000)}"
         *Instrucción:* Úsalo SOLO para rellenar datos duros que no estén en las notas (Nombre completo, Título universitario exacto, Ubicación, Nombres de empresas anteriores).

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
// 🧠 CEREBRO IA: CLASIFICADOR VIVIANA/GLADYMAR/SANDRA (FINAL CON FLAGS)
// ==========================================
async function verificaConocimientosMinimos(puesto, textoCandidato, declaraciones = "") {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

    const prompt = `
      ACTÚA COMO: Reclutador Senior de Global Talent Connections (Criterio Unificado).
      TU OBJETIVO: Evaluar a este candidato para el puesto de "${puesto}" y asignar Score + Alertas.
      
      === FUENTES DE INFORMACIÓN ===
      [DATOS TÉCNICOS Y RESPUESTAS DEL FORMULARIO]:
      ${textoCandidato.slice(0, 15000)}

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

      === 📋 CRITERIOS DE PERFIL ===
      > SENIORITY: Junior (1-2), Semi-Senior (2-5), Senior (+5).
      > ROLES:
        - Automatización: Experiencia REAL en Make/Zapier.
        - Dev Web: Stack moderno + Portafolio.

      === 🧮 SALIDA JSON EXACTA ===
      Responde SOLO con este JSON:
      {
        "score": (0-100),
        "pasa": (true si score >= 70),
        "motivos": "Frase de 1 línea justificando el score.",
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
app.post("/webhook/zoho", async (req, res) => {
  try {
    console.log("📨 [Webhook] Datos recibidos de Zoho. Iniciando modo PASIVO.");
    const data = req.body;

    // 1. SANITIZACIÓN ID (CRÍTICO: Mismo método que usaremos en el Email)
    const emailRaw = (data.Email || "").trim().toLowerCase();
    if (!emailRaw) return res.status(400).send("Falta Email");
    
    // ID ÚNICO: grillo.vge98@gmail.com -> grillo_vge98_gmail_com
    const safeId = emailRaw.replace(/[^a-z0-9]/g, "_");

    // 2. OBJETO BASE (Sin IA todavía)
    const candidato = {
      id: safeId,
      nombre: `${data.Nombre_Completo || ""} ${data.Apellido || ""}`.trim(),
      email: emailRaw,
      telefono: data.Telefono || "",
      puesto: data.Puesto_Solicitado || "General",
      
      // Guardamos las respuestas para que la IA las lea DESPUÉS (cuando llegue el mail)
      respuestas_filtro: {
        salario: data.Acepta_Salario,
        monitoreo: data.Acepta_Monitoreo,
        disponibilidad: data.Disponibilidad,
        herramientas: data.Top_Herramientas,
        resolucion: data.Resolucion_Problemas
      },

      // ESTADO INICIAL: "ESPERANDO PDF"
      ia_score: 0,
      ia_status: "waiting_cv", // El frontend puede mostrar un spinner o "Cargando CV..."
      ia_motivos: "Esperando recepción de CV para análisis completo.",
      
      cv_url: "", // Vacío por ahora
      tiene_pdf: false,
      
      creado_en: admin.firestore.FieldValue.serverTimestamp(),
      origen: "webhook_zoho_passive"
    };

    // 3. GUARDAR EN LA CARPETA MADRE
    await firestore.collection("CVs_staging").doc(safeId).set(candidato, { merge: true });

    console.log(`✅ [Webhook] Candidato guardado en espera: ${safeId}`);
    res.status(200).send("OK");

  } catch (error) {
    console.error("❌ Error Webhook:", error);
    res.status(500).send("Error");
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
// 🛠️ ENDPOINT GENÉRICO PARA ACTUALIZAR CAMPOS (PATCH)
// ==========================================
app.patch("/candidatos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body; // Ej: { status_interno: 'gestion' }

    if (!id || Object.keys(updates).length === 0) {
      return res.status(400).send("Faltan datos.");
    }

    // Aseguramos que solo toque la colección maestra
    await firestore.collection("CVs_staging").doc(id).update({
      ...updates,
      actualizado_en: new Date().toISOString()
    });

    console.log(`🔄 Candidato ${id} actualizado:`, Object.keys(updates));
    res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error actualizando candidato:", error);
    res.status(500).send("Error al actualizar.");
  }
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
  
  // 1. Ejecutar inmediatamente al arrancar para no esperar
  analizarCorreos(); 
  
  // 2. Programar repetición cada 60 segundos (60000 ms)
  setInterval(() => {
      console.log("⏰ Ciclo programado: Buscando nuevos correos...");
      analizarCorreos();
  }, 60000); 
});
// Forzar reinicio v2