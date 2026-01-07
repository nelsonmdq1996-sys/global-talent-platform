const API_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:3001"       // Si estoy en mi compu
    : window.location.origin;       // <--- MAGIA: Detecta la URL real automáticamente (sea cual sea)

console.log(`🚀 Conectado a la API en: ${API_URL}`);

// --- HELPER PARA OBTENER TOKEN DE FIREBASE ---
async function getAuthToken() {
    try {
        // Verificar si hay token guardado y si no expiró
        const token = localStorage.getItem('firebase_token');
        const expires = localStorage.getItem('firebase_token_expires');
        
        if (token && expires && Date.now() < parseInt(expires)) {
            return token;
        }
        
        // Si expiró o no existe, intentar renovar
        if (window.firebaseAuth && window.firebaseAuth.currentUser) {
            const user = window.firebaseAuth.currentUser;
            const newToken = await user.getIdToken();
            localStorage.setItem('firebase_token', newToken);
            localStorage.setItem('firebase_token_expires', (Date.now() + 3600000).toString());
            return newToken;
        }
        
        return null;
    } catch (error) {
        console.warn('⚠️ Error obteniendo token:', error);
        return null;
    }
}

// --- HELPER PARA AGREGAR HEADERS CON TOKEN ---
async function getHeaders(customHeaders = {}) {
    const headers = { ...customHeaders };
    const token = await getAuthToken();
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
}

const api = {
            reports: {
                generate: async (id, manualData = null) => {
                    try {
                        const headers = await getHeaders({ 'Content-Type': 'application/json' });
                        const response = await fetch(`${API_URL}/candidatos/${id}/resumen`, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({ forceRegenerate: !!manualData, manualData: manualData })
                        });
                        return await response.json();
                    } catch (e) { return null; }
                }
            },
            candidates: {
                list: async () => {
                    try {
                        const res = await fetch(`${API_URL}/buscar`);
                        const data = await res.json();
                        const lista = data.resultados || [];
                        return lista.map(c => ({
                        id: c.id,
                        nombre: c.nombre || "Sin Nombre",
                        email: c.email || "S/E",
                        puesto: c.puesto || "General",
                        
                        // 🔥 DATOS DE IA Y FILTROS
                        ia_score: c.ia_score || 0,
                        ia_motivos: c.ia_motivos || c.motivo || "Análisis pendiente...", 
                        ia_alertas: c.ia_alertas || [],
                        respuestas_filtro: c.respuestas_filtro || {}, 
                        
                        // 🎥 VIDEO Y ARCHIVOS (ARREGLADO PARA ZOHO)
                        cv_url: c.cv_url || '#',
                        // Aquí agregamos c.Video_Link para que lea lo que viene del formulario
                        video_url: c.video_url || c.Video_Link || null,
                        reseña_video: c.reseña_video || c.reseñaVideo || null,
                        reseña_cv: c.reseña_cv || null,
                        video_tipo: c.video_tipo || null, 
                        
                        // ESTADOS
                        fecha: c.fecha || c.creado_en,
                        stage: c.stage || (c.status_interno === 'new' ? 'stage_1' : 'stage_1'), 
                        status_interno: c.status_interno || 'new',
                        origen: c.origen || null,
                        
                        // 👇 ESTOS SON LOS DOS CABLES QUE FALTABAN PARA LA PERSISTENCIA 👇
                        assignedTo: c.assignedTo || null,      
                        history: c.history || c.historial_movimientos || [], 
                        
                        notes: c.motivo || c.notes || '', 
                        informe_final_data: c.informe_final_data || null,
                        
                        // 🔥 GESTIÓN DE ENTREVISTA (para que persistan después de refrescar)
                        meet_link: c.meet_link || null,
                        interview_transcript: c.interview_transcript || null,
                        transcripcion_entrevista: c.transcripcion_entrevista || null,
                        process_step_2_form: c.process_step_2_form || null,
                        process_step_3_result: c.process_step_3_result || null
                    }));
                    } catch (error) {
                        console.error("Error cargando:", error);
                        return []; 
                    }
                },
                // 🚀 EL ARREGLO DEL BOTÓN (USANDO PATCH)
                update: async (id, updates) => {
                    try {
                        const headers = await getHeaders({ 'Content-Type': 'application/json' });
                        await fetch(`${API_URL}/candidatos/${id}`, {
                            method: 'PATCH',
                            headers: headers,
                            body: JSON.stringify(updates)
                        });
                        return { ok: true };
                    } catch (e) {
                        console.error(e);
                        return { ok: false };
                    }
                },
                
                analizarCV: async (formData) => {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api-client.js:82',message:'Iniciando llamada analizarCV',data:{url:`${API_URL}/candidatos/analizar-cv`,hasFormData:!!formData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    try {
                        const res = await fetch(`${API_URL}/candidatos/analizar-cv`, { 
                            method: 'POST', 
                            body: formData 
                        });
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api-client.js:87',message:'Respuesta recibida del servidor',data:{status:res.status,statusText:res.statusText,contentType:res.headers.get('content-type')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                        const textResponse = await res.text();
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api-client.js:90',message:'Texto de respuesta recibido',data:{textPreview:textResponse.substring(0,200),isHTML:textResponse.trim().startsWith('<!DOCTYPE'),isJSON:textResponse.trim().startsWith('{')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                        return JSON.parse(textResponse);
                    } catch (e) {
                        console.error("Error en análisis:", e);
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/f002550b-8fd2-4cb5-a05e-1ab2645067d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api-client.js:95',message:'Error al parsear respuesta',data:{error:e.message,errorType:e.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                        return { ok: false, error: e.message };
                    }
                },
                manualUpload: async (formData) => {
                    try {
                        const res = await fetch(`${API_URL}/candidatos/ingreso-manual`, { 
                            method: 'POST', 
                            body: formData 
                        });
                        return await res.json();
                    } catch (e) {
                        console.error("Error en upload:", e);
                        return { ok: false, error: e.message };
                    }
                }
            },
            metrics: {
                get: async () => {
                    try {
                        const headers = await getHeaders();
                        const res = await fetch(`${API_URL}/panel/metrics`, { headers });
                        const data = await res.json();
                        return { totals: data.totals }; 
                    } catch (e) { return { totals: {} }; }
                }
            },
            // Para el ReportView modo manual
            processManualReport: async (formData) => {
                const headers = await getHeaders();
                const res = await fetch(`${API_URL}/manual-upload`, { 
                    method: 'POST', 
                    headers: headers,
                    body: formData 
                });
                if (!res.ok) throw new Error("Error en el servidor");
                return await res.json();
            },
            webhooks: {
                getStatus: async () => {
                    try {
                        const headers = await getHeaders();
                        const res = await fetch(`${API_URL}/webhooks/status`, { headers });
                        if (!res.ok) throw new Error("Error en servidor");
                        return await res.json();
                    } catch (e) {
                        console.error("Error obteniendo estado de webhooks:", e);
                        return { 
                            zoho_form1: { status: "rojo", razon: "Error de conexión" },
                            zoho_form2: { status: "rojo", razon: "Error de conexión" }
                        };
                    }
                }
            }
        };

        // --- HACER API GLOBAL ---
window.api = api;
window.API_URL = API_URL;
            
        

