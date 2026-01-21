// zohoWorkDrive.js
const axios = require('axios');

// Cache del access token
let accessTokenCache = {
  token: null,
  expiresAt: 0
};

/**
 * Obtiene un access token válido de Zoho (usa refresh token)
 */
async function getZohoAccessToken() {
  // Si el token en cache aún es válido, usarlo
  if (accessTokenCache.token && Date.now() < accessTokenCache.expiresAt - 60000) {
    return accessTokenCache.token;
  }

  const region = process.env.ZOHO_REGION || 'eu';
  const tokenUrl = `https://accounts.zoho.${region}/oauth/v2/token`;

  try {
    const response = await axios.post(tokenUrl, null, {
      params: {
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      }
    });

    // Guardar en cache (expira en 1 hora normalmente)
    accessTokenCache = {
      token: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in * 1000)
    };

    console.log('✅ [WorkDrive] Token de acceso obtenido correctamente');
    return accessTokenCache.token;

  } catch (error) {
    console.error('❌ [WorkDrive] Error obteniendo token:', error.response?.data || error.message);
    throw new Error('No se pudo autenticar con Zoho WorkDrive');
  }
}

/**
 * Lista las subcarpetas de una carpeta en WorkDrive
 * @param {string} folderId - ID de la carpeta padre
 */
async function listarSubcarpetas(folderId = null) {
    const token = await getZohoAccessToken();
    const region = process.env.ZOHO_REGION || 'eu';
    const targetFolder = folderId || process.env.ZOHO_WORKDRIVE_FOLDER_ID;
  
    try {
      // Endpoint para listar contenido de una carpeta (sin parámetros extra)
      const listUrl = `https://workdrive.zoho.${region}/api/v1/files/${targetFolder}/files`;
      
      const response = await axios.get(listUrl, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`
        }
      });
  
      const items = response.data?.data || [];
      // Filtrar solo carpetas (type = 'folder')
      const carpetas = items.filter(item => item.attributes?.type === 'folder');
      console.log(`📁 [WorkDrive] Encontradas ${carpetas.length} subcarpetas`);
      
      return carpetas;
  
    } catch (error) {
      console.error('❌ [WorkDrive] Error listando subcarpetas:', error.response?.data || error.message);
      throw new Error(`Error listando subcarpetas: ${error.message}`);
    }
  }

/**
 * Lista los archivos dentro de una carpeta
 * @param {string} folderId - ID de la carpeta
 */
async function listarArchivosEnCarpeta(folderId) {
    const token = await getZohoAccessToken();
    const region = process.env.ZOHO_REGION || 'eu';
  
    try {
      const listUrl = `https://workdrive.zoho.${region}/api/v1/files/${folderId}/files`;
      
      const response = await axios.get(listUrl, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`
        }
      });
  
      const archivos = response.data?.data || [];
      console.log(`📄 [WorkDrive] Encontrados ${archivos.length} archivos en carpeta`);
      
      return archivos;
  
    } catch (error) {
      console.error('❌ [WorkDrive] Error listando archivos:', error.response?.data || error.message);
      throw new Error(`Error listando archivos: ${error.message}`);
    }
  }

/**
 * Busca la carpeta de un candidato por email
 * @param {string} email - Email del candidato
 * @returns {Object|null} - Carpeta encontrada o null
 */
async function buscarCarpetaCandidato(email) {
  if (!email) return null;
  
  const emailLower = email.toLowerCase().trim();
  console.log(`🔍 [WorkDrive] Buscando carpeta para: ${emailLower}`);
  
  try {
    const subcarpetas = await listarSubcarpetas();
    
    // Buscar carpeta que contenga el email en su nombre
    // Formato esperado: "Nombre Apellido - email@gmail.com"
    const carpetaEncontrada = subcarpetas.find(carpeta => {
      const nombreCarpeta = (carpeta.attributes?.name || '').toLowerCase();
      return nombreCarpeta.includes(emailLower);
    });
    
    if (carpetaEncontrada) {
      console.log(`✅ [WorkDrive] Carpeta encontrada: ${carpetaEncontrada.attributes?.name}`);
      return carpetaEncontrada;
    }
    
    console.log(`⚠️ [WorkDrive] No se encontró carpeta para: ${emailLower}`);
    return null;
    
  } catch (error) {
    console.error('❌ [WorkDrive] Error buscando carpeta:', error.message);
    throw error;
  }
}

/**
 * Busca un archivo PDF en la carpeta de un candidato
 * @param {string} email - Email del candidato
 * @returns {Object|null} - Archivo PDF encontrado o null
 */
async function buscarArchivoEnWorkDrive(email) {
  try {
    // 1. Buscar la carpeta del candidato
    const carpeta = await buscarCarpetaCandidato(email);
    
    if (!carpeta) {
      return [];
    }
    
    // 2. Listar archivos en la carpeta
    const archivos = await listarArchivosEnCarpeta(carpeta.id);
    
    // 3. Filtrar solo PDFs (probablemente el CV)
    const pdfs = archivos.filter(archivo => {
      const nombre = (archivo.attributes?.name || '').toLowerCase();
      return nombre.endsWith('.pdf');
    });
    
    // 4. Priorizar archivos que tengan "cv" en el nombre
    pdfs.sort((a, b) => {
      const nombreA = (a.attributes?.name || '').toLowerCase();
      const nombreB = (b.attributes?.name || '').toLowerCase();
      const tieneCV_A = nombreA.includes('cv') || nombreA.includes('curriculum');
      const tieneCV_B = nombreB.includes('cv') || nombreB.includes('curriculum');
      
      if (tieneCV_A && !tieneCV_B) return -1;
      if (!tieneCV_A && tieneCV_B) return 1;
      return 0;
    });
    
    console.log(`📄 [WorkDrive] PDFs encontrados: ${pdfs.length}`);
    return pdfs;
    
  } catch (error) {
    console.error('❌ [WorkDrive] Error buscando archivo:', error.message);
    throw error;
  }
}

/**
 * Descarga un archivo de WorkDrive por su ID
 * @param {string} fileId - ID del archivo en WorkDrive
 * @returns {Buffer} - Contenido del archivo
 */
async function descargarArchivoDeWorkDrive(fileId) {
  const token = await getZohoAccessToken();
  const region = process.env.ZOHO_REGION || 'eu';

  try {
    // Endpoint de descarga
    const downloadUrl = `https://workdrive.zoho.${region}/api/v1/download/${fileId}`;
    
    const response = await axios.get(downloadUrl, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`
      },
      responseType: 'arraybuffer',
      timeout: 60000, // 60 segundos
      maxContentLength: 20 * 1024 * 1024 // 20MB máximo
    });

    console.log(`✅ [WorkDrive] Archivo descargado: ${(response.data.length / 1024).toFixed(2)} KB`);
    return Buffer.from(response.data);

  } catch (error) {
    console.error('❌ [WorkDrive] Error descargando:', error.response?.data || error.message);
    throw new Error(`Error descargando de WorkDrive: ${error.message}`);
  }
}
/**
 * Busca un archivo de video en la carpeta de un candidato
 * @param {string} email - Email del candidato
 * @returns {Object|null} - Archivo de video encontrado o null
 */
async function buscarVideoEnWorkDrive(email) {
    try {
      // 1. Buscar la carpeta del candidato
      const carpeta = await buscarCarpetaCandidato(email);
      
      if (!carpeta) {
        return [];
      }
      
      // 2. Listar archivos en la carpeta
      const archivos = await listarArchivosEnCarpeta(carpeta.id);
      
      // 3. Filtrar solo videos
      const videos = archivos.filter(archivo => {
        const nombre = (archivo.attributes?.name || '').toLowerCase();
        return nombre.endsWith('.mp4') || nombre.endsWith('.mov') || 
               nombre.endsWith('.avi') || nombre.endsWith('.webm');
      });
      
      console.log(`🎥 [WorkDrive] Videos encontrados: ${videos.length}`);
      return videos;
      
    } catch (error) {
      console.error('❌ [WorkDrive] Error buscando video:', error.message);
      throw error;
    }
  }

module.exports = {
    getZohoAccessToken,
    buscarArchivoEnWorkDrive,
    buscarVideoEnWorkDrive,
    descargarArchivoDeWorkDrive,
    listarSubcarpetas,
    listarArchivosEnCarpeta,
    buscarCarpetaCandidato
};