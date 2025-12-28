# 🌟 GLOBAL TALENT CONNECTIONS

> **Sistema de Reclutamiento Automatizado con IA**
> 
> Procesa candidatos desde el email inicial hasta generar reportes profesionales con análisis inteligente.

---

## 📊 Status del Proyecto

| Aspecto | Estado |
|---------|--------|
| **Versión** | 1.0.0 |
| **Estado General** | ✅ Producción |
| **Última actualización** | 28 de Diciembre, 2025 |
| **Calificación** | 8.5/10 ⭐⭐⭐⭐⭐ |
| **Usuarios soportados** | 5 máximo |
| **Costo mensual** | $1 - $35 USD |

---

## 🎯 ¿Qué hace?

**Global Talent Connections** es un sistema que **automatiza el proceso completo de reclutamiento:**

1. 📧 **Recibe CVs automáticamente** por email
2. 🧠 **Clasifica candidatos con IA** (Gemini)
3. 🎬 **Analiza entrevistas en video**
4. 📄 **Genera reportes profesionales en DOCX**
5. 👥 **Gestiona el flujo de decisiones** (Aprobar, Rechazar, Contratar)
6. 🗑️ **Mantiene papelera de recuperación** con backups automáticos

---

## 🚀 Inicio Rápido

### Prerequisitos
- Node.js 18+
- npm o yarn
- Cuenta Google (Gmail + Cloud)
- Cuenta Firebase

### Instalación (3 pasos)

```
# 1. Clonar e instalar dependencias
git clone <tu-repo>
cd proyecto
npm install

# 2. Configurar variables de entorno (.env)
cp .env.example .env
# Edita .env con tus credenciales

# 3. Iniciar el servidor
npm start
```

Dashboard abierto en: **http://localhost:3001**

---

## 🏗️ Stack Tecnológico

```
┌─ FRONTEND ─────────────────────┐
│ HTML5 + Vanilla JS             │
│ Tailwind CSS                   │
└────────────────────────────────┘

┌─ BACKEND ──────────────────────┐
│ Node.js 18+                    │
│ Express 4.21                   │
│ Firebase Admin SDK             │
└────────────────────────────────┘

┌─ INTELIGENCIA ARTIFICIAL ──────┐
│ Google Generative AI (Gemini)  │
│ Google Vision OCR              │
│ Google Speech-to-Text          │
└────────────────────────────────┘

┌─ DATOS ────────────────────────┐
│ Firestore (NoSQL)              │
│ Google Cloud Storage           │
└────────────────────────────────┘

┌─ INTEGRACIONES ────────────────┐
│ Gmail IMAP                     │
│ Zoho Forms (2 webhooks)        │
│ Nodemailer                     │
└────────────────────────────────┘
```

---

## 📋 Features Principales

### ✅ Automatización Completa
- [x] Lectura automática de Gmail cada 2 minutos
- [x] Extracción de PDF → Texto (con OCR si es scan)
- [x] Detección automática de puesto desde subject

### ✅ Análisis con IA
- [x] Clasificación de CV en JSON estructurado
- [x] Análisis profundo post-entrevista
- [x] Generación automática de reportes DOCX

### ✅ Gestión de Candidatos
- [x] Dashboard responsivo (Explorar → Gestión → Decisión)
- [x] Agendamiento de entrevistas automático
- [x] Papelera con opción de reactivar

### ✅ Seguridad
- [x] Autenticación Firebase (5 usuarios max)
- [x] Rate limiting (120 req/min)
- [x] Helmet.js headers
- [x] Variables de entorno seguras

---

## 📖 Documentación

Este proyecto incluye documentación completa orientada al onboarding:

| Documento | Público | Contenido |
|-----------|---------|----------|
| **ONBOARDING_COMPLETO.md** | Nuevos devs | Guía paso a paso con metáforas |
| **CONCEPTOS_FUNDAMENTALES.md** | Tech Leads | Explicación profunda de arquitectura |
| **FLUJO_OPERACIONAL.md** | Todos | Cómo funciona el sistema día a día |
| **CHECKLIST_IMPLEMENTACION.md** | Devs | 30 acciones para escalar de 8.5 a 10/10 |
| **TROUBLESHOOTING.md** | Support | Soluciones a problemas comunes |

---

## 🎓 Para Nuevos Miembros del Equipo

Si es tu **primer día**, empieza aquí:

```
1. Lee: ONBOARDING_COMPLETO.md (30 min)
2. Lee: CONCEPTOS_FUNDAMENTALES.md (20 min)
3. Lee: FLUJO_OPERACIONAL.md (20 min)
4. Prueba: npm start y abre http://localhost:3001 (10 min)
5. Pregunta: ¿Dudas? Ve a TROUBLESHOOTING.md
```

**Tiempo total:** ~80 minutos para comprenderlo todo.

---

## 🔄 El Sistema en una Frase

> **Imagina que tienes un mozo 24/7 que lee todos tus emails de candidatos, 
> los clasifica automáticamente, analiza sus videos, ¡y hasta te genera 
> reportes profesionales listos para presentar a directivos.**

---

## 💰 Pricing & Costos

### Costo Real Mensual
- Google APIs: **$0.77**
- Hosting (Render/Vercel): **$0-8**
- Firebase Plan: **$0-25**
- **TOTAL: $1-35 USD/mes**

### Comparación vs Competencia
| Producto | Precio/mes | Ahorro |
|----------|-----------|--------|
| **GTC (Nuestro)** | **$1-35** 🟢 | - |
| Workable | $99+ | 65% |
| Lever | $200+ | 83% |
| Bullhorn | $500+ | 93% |

---

## 👥 Arquitectura de Equipo

El sistema está diseñado para ser mantenido por:

- **1 Backend Developer** - Mantiene APIs, IA, integraciones
- **1 DevOps** - Deploy, monitoreo, backups
- **1-2 Reclutadores** - Usan el dashboard (máx 5 usuarios)

---

## 📞 Support & Issues

- **Bug técnico** → Ver `TROUBLESHOOTING.md`
- **No entiendo algo** → Ver `ONBOARDING_COMPLETO.md`
- **Quiero mejorar X** → Ver `CHECKLIST_IMPLEMENTACION.md`

---

## 📄 Licencia

Uso privado de Global Talent Connections.

---

**Made with ❤️ for better recruitment automation**

*Global Talent Connections - Conectando talento, automáticamente.*
```
