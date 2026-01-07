

        // --- 1. ARQUITECTURA DE DATOS (CEREBRO) ---

        const MOCK_DB = [
        { 
            id: 'c1', 
            nombre: 'Sofia Martínez', 
            email: 'sofia.m@example.com', 
            puesto: 'Asistente de Marketing', 
            ia_score: 94, 
            fecha: '2023-10-24T10:00:00Z', 
            stage: 'stage_1', 
            status_interno: 'new', // Esto activa la alerta de "Nuevo"
            cv_url: '#', 
            video_url: '#', 
            notes: 'Experiencia sólida en Meta Ads. Perfil interesante.', 
            alerts: ['Inglés C1', 'Certificada Google'],
            history: [
                { date: '2023-10-24T10:00:00Z', event: 'Ingreso al Pipeline', detail: 'Vía Zoho Forms' }
            ]
        },
        { 
            id: 'c2', 
            nombre: 'Lucas Ramirez', 
            email: 'lucas.r@example.com', 
            puesto: 'Asistente IA', 
            ia_score: 88, 
            fecha: '2023-10-24T09:30:00Z', 
            stage: 'stage_1', 
            status_interno: 'viewed', 
            cv_url: '#', 
            video_url: null, 
            notes: '', 
            alerts: ['Experto en Zapier'],
            history: [
                { date: '2023-10-24T09:30:00Z', event: 'Ingreso al Pipeline', detail: 'Vía Zoho Forms' },
                { date: '2023-10-24T11:00:00Z', event: 'Revisión Inicial', detail: 'Abierto por Admin' }
            ]
        },
        { 
            id: 'c3', 
            nombre: 'Mariana Lopez', 
            email: 'mariana.l@example.com', 
            puesto: 'Asistente Financiero', 
            ia_score: 91, 
            fecha: '2023-10-22T14:00:00Z', 
            stage: 'stage_2', 
            status_interno: 'interview_scheduled', 
            assignedTo: 'Admin', 
            interview_date: '2023-10-26T10:00:00Z', 
            meet_link: 'https://meet.google.com/abc-defg-hij',
            cv_url: '#', 
            video_url: 'https://loom.com/share/demo', 
            form2_received: false, 
            form2_sent: false,
            qualified: null, 
            notes: 'Pre-calificada correctamente. Agendar técnica.',
            history: [
                { date: '2023-10-22T14:00:00Z', event: 'Ingreso al Pipeline', detail: 'Vía Web' },
                { date: '2023-10-23T09:00:00Z', event: 'Aprobado a Gestión', detail: 'Por Admin' },
                { date: '2023-10-23T10:30:00Z', event: 'Entrevista Agendada', detail: 'Para 26/10' }
            ]
        },
        { 
            id: 'c4', 
            nombre: 'Javier Costa', 
            email: 'javier.c@example.com', 
            puesto: 'Desarrollador Web', 
            ia_score: 75, 
            fecha: '2023-10-20T11:00:00Z', 
            stage: 'trash', 
            status_interno: 'discarded', 
            cv_url: '#', 
            notes: 'Salario fuera de rango', 
            alerts: ['Salario Alto'],
            history: [
                { date: '2023-10-20T11:00:00Z', event: 'Ingreso', detail: '' },
                { date: '2023-10-21T09:00:00Z', event: 'Descarte', detail: 'Salario fuera de rango' }
            ]
        },
        { 
            id: 'c5', 
            nombre: 'Elena Volkov', 
            email: 'elena@example.com', 
            puesto: 'Project Manager', 
            ia_score: 98, 
            fecha: '2023-10-15T09:00:00Z', 
            stage: 'stage_3', 
            status_interno: 'ready_for_report', 
            cv_url: '#', 
            video_url: '#', 
            form2_received: true, 
            form2_sent: true,
            qualified: true, 
            report_generated: false, 
            notes: 'Lista para presentar al cliente.',
            history: [
                { date: '2023-10-15T09:00:00Z', event: 'Ingreso', detail: '' },
                { date: '2023-10-16T14:00:00Z', event: 'Aprobado a Gestión', detail: 'Por Admin' },
                { date: '2023-10-18T10:00:00Z', event: 'Entrevista Completada', detail: 'Exitosa' },
                { date: '2023-10-19T11:00:00Z', event: 'Calificado Positivo', detail: 'Pasa a Informe' }
            ]
        },
        ];

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


        const formatDate = (isoString) => {
            if (!isoString) return '-';
            try {
                return new Date(isoString).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
            } catch (e) {
                return '-';
            }
        };

        const formatTime = (isoString) => {
            if (!isoString) return '';
            try {
                return new Date(isoString).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                return '';
            }
        };

        const STATUS_LABELS = {
            'new': 'Nuevo Ingreso',
            'viewed': 'En Revisión',
            'interview_pending': 'Pendiente Entrevista',
            'interview_scheduled': 'Entrevista Agendada',
            'interview_completed': 'Entrevista Realizada',
            'pending_form2': 'Pendiente Formulario 2',
            'ready_for_report': 'Listo para Informe',
            'discarded': 'Descartado'
        };

        const getStatusLabel = (status) => STATUS_LABELS[status] || status || 'En Proceso';     

       

        // --- 3. VISTAS DEL SISTEMA ---

        function DashboardView({ candidates, onNavigate }) {
        // Calculamos estadísticas con lógica de "Nuevos sin ver"
        const stats = {
            new: candidates.filter(c => c.stage === 'stage_1').length,
            newUnseen: candidates.filter(c => c.stage === 'stage_1' && c.status_interno === 'new').length,
            interview: candidates.filter(c => c.stage === 'stage_2').length,
            ready: candidates.filter(c => c.stage === 'stage_3').length,
            trash: candidates.filter(c => c.stage === 'trash').length,
            total: candidates.filter(c => c.stage !== 'trash').length
        };
        
        // Calcular métricas rápidas
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        const parseFirebaseDate = (dateValue) => {
            if (!dateValue) return null;
            if (typeof dateValue === 'object' && dateValue._seconds) {
                return new Date(dateValue._seconds * 1000);
            }
            if (typeof dateValue === 'string') {
                return new Date(dateValue);
            }
            return new Date(dateValue);
        };
        
        const candidatosHoy = candidates.filter(c => {
            const fecha = parseFirebaseDate(c.fecha || c.creado_en);
            if (!fecha) return false;
            return fecha >= hoy;
        }).length;
        
        const tasaExplorarAGestion = stats.new > 0 
            ? Math.round((stats.interview / stats.new) * 100) 
            : 0;
        
        const tasaGestionAInforme = stats.interview > 0 
            ? Math.round((stats.ready / stats.interview) * 100) 
            : 0;
        
        // Entrevistas pendientes a programar (stage_2 sin meet_link)
        const entrevistasPendientes = candidates.filter(c => 
            c.stage === 'stage_2' && !c.meet_link
        ).length;
        
        // Candidatos listos para informes (stage_3 sin informe_final_data)
        const listosParaInformes = candidates.filter(c => 
            c.stage === 'stage_3' && !c.informe_final_data
        ).length;
        
        // Cantidad de Form 2 recibido
        const form2Recibidos = candidates.filter(c => 
            c.respuestas_form2 || c.process_step_2_form === 'received'
        ).length;
        
        // Tiempo promedio en cada etapa (en días)
        const calcularTiempoPromedio = (stage) => {
            const candidatosEnStage = candidates.filter(c => c.stage === stage);
            if (candidatosEnStage.length === 0) return 0;
            
            const ahora = new Date();
            const tiempos = candidatosEnStage.map(c => {
                // Buscar en el historial cuándo entró a este stage
                const historial = c.history || c.historial_movimientos || [];
                
                // Buscar eventos relacionados con el cambio a este stage
                let fechaEntrada = null;
                if (historial.length > 0) {
                    // Buscar el último evento que indica entrada a este stage
                    const eventosRelevantes = historial.filter(h => {
                        if (!h.event || !h.date) return false;
                        const eventLower = h.event.toLowerCase();
                        return (
                            (stage === 'stage_1' && (eventLower.includes('ingreso') || eventLower.includes('pipeline'))) ||
                            (stage === 'stage_2' && (eventLower.includes('gestión') || eventLower.includes('aprobado') || eventLower.includes('gestion'))) ||
                            (stage === 'stage_3' && (eventLower.includes('informe') || eventLower.includes('listo')))
                        );
                    });
                    
                    if (eventosRelevantes.length > 0) {
                        // Tomar el más reciente
                        const ultimoEvento = eventosRelevantes[eventosRelevantes.length - 1];
                        fechaEntrada = parseFirebaseDate(ultimoEvento.date);
                    }
                }
                
                // Si no encontramos en historial, usar fecha de creación como fallback
                if (!fechaEntrada) {
                    fechaEntrada = parseFirebaseDate(c.fecha || c.creado_en);
                }
                
                if (fechaEntrada) {
                    const diffMs = ahora - fechaEntrada;
                    const dias = diffMs / (1000 * 60 * 60 * 24);
                    return dias > 0 ? dias : 0; // Solo días positivos
                }
                
                return 0;
            }).filter(t => t > 0);
            
            if (tiempos.length === 0) return 0;
            return Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
        };
        
        const tiempoPromedioStage1 = calcularTiempoPromedio('stage_1');
        const tiempoPromedioStage2 = calcularTiempoPromedio('stage_2');
        const tiempoPromedioStage3 = calcularTiempoPromedio('stage_3');
        
        // Estado para monitorear webhooks
        const [webhookStatus, setWebhookStatus] = useState({
            zoho_form1: { status: "verde", razon: "Cargando..." },
            zoho_form2: { status: "verde", razon: "Cargando..." }
        });
        
        useEffect(() => {
            const cargarEstado = async () => {
                const estado = await api.webhooks.getStatus();
                setWebhookStatus(estado);
            };
            
            cargarEstado(); // Cargar inmediatamente
            const intervalo = setInterval(cargarEstado, 300000); // Cada 5 minutos  (300000 ms)
            
            return () => clearInterval(intervalo); // Limpiar al desmontar
        }, []);

        return (
            <div className="animate-in fade-in duration-500 max-w-7xl mx-auto">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Panel de Control</h1>
                    <p className="text-slate-400 text-sm">Resumen operativo compacto.</p>
                </div>
                <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Sistema Online</span>
                </div>
            </header>
            
            {/* Nuevo Grafico de Embudo Horizontal Compacto */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="lg:col-span-2">
                    <HorizontalFunnel stats={stats} />
                </div>
                <div className="space-y-4">
                    {/* Tarjetas de Acceso Rápido Compactas */}
                    <button onClick={() => onNavigate('stage_1')} className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500/50 transition-all group flex items-center justify-between">
                        <div className="text-left">
                            <p className="text-[10px] uppercase font-bold text-slate-500">Bandeja de Entrada</p>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold text-white">{stats.new}</span>
                                {stats.newUnseen > 0 && (
                                    <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded-full animate-bounce">
                                        {stats.newUnseen} pendientes
                                    </span>
                                )}
                            </div>
                        </div>
                        <UserPlus className="text-blue-500 group-hover:scale-110 transition-transform" size={24}/>
                    </button>

                    <button onClick={() => onNavigate('trash')} className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-rose-500/50 transition-all group flex items-center justify-between">
                        <div className="text-left">
                            <p className="text-[10px] uppercase font-bold text-slate-500">Papelera</p>
                            <span className="text-2xl font-bold text-white">{stats.trash}</span>
                        </div>
                        <Trash2 className="text-rose-500 group-hover:scale-110 transition-transform" size={24}/>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Activity size={16}/> Métricas Rápidas</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {/* Candidatos Procesados Hoy */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Procesados Hoy</p>
                            <p className="text-2xl font-bold text-white">{candidatosHoy}</p>
                        </div>
                        
                        {/* Tasa Explorar → Gestión */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Explorar → Gestión</p>
                            <p className="text-2xl font-bold text-blue-400">{tasaExplorarAGestion}%</p>
                            <p className="text-[9px] text-slate-600 mt-0.5">{stats.interview} de {stats.new}</p>
                        </div>
                        
                        {/* Tasa Gestión → Informe */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Gestión → Informe</p>
                            <p className="text-2xl font-bold text-emerald-400">{tasaGestionAInforme}%</p>
                            <p className="text-[9px] text-slate-600 mt-0.5">{stats.ready} de {stats.interview}</p>
                        </div>
                        
                        {/* Entrevistas Pendientes */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Entrevistas Pendientes</p>
                            <p className="text-2xl font-bold text-amber-400">{entrevistasPendientes}</p>
                            <p className="text-[9px] text-slate-600 mt-0.5">sin programar</p>
                        </div>
                        
                        {/* Candidatos Listos para Informes */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Listos para Informes</p>
                            <p className="text-2xl font-bold text-purple-400">{listosParaInformes}</p>
                            <p className="text-[9px] text-slate-600 mt-0.5">pendientes</p>
                        </div>
                        
                        {/* Form 2 Recibido */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Form 2 Recibido</p>
                            <p className="text-2xl font-bold text-cyan-400">{form2Recibidos}</p>
                            <p className="text-[9px] text-slate-600 mt-0.5">completados</p>
                        </div>
                        
                        {/* Tiempo Promedio Stage 1 */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Tiempo Prom. Explorar</p>
                            <p className="text-2xl font-bold text-slate-300">{tiempoPromedioStage1}</p>
                            <p className="text-[9px] text-slate-600 mt-0.5">días</p>
                        </div>
                        
                        {/* Tiempo Promedio Stage 2 */}
                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Tiempo Prom. Gestión</p>
                            <p className="text-2xl font-bold text-slate-300">{tiempoPromedioStage2}</p>
                            <p className="text-[9px] text-slate-600 mt-0.5">días</p>
                        </div>
                    </div>
                </div>
                
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Globe size={16}/> Integraciones</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {/* Card Zoho Form 1 - Estado dinámico */}
                            <div className={`p-3 bg-slate-950 rounded-lg border flex items-center gap-3 ${
                                webhookStatus.zoho_form1?.status === "verde" 
                                    ? "border-green-500/50" 
                                    : "border-red-500/50"
                            }`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    webhookStatus.zoho_form1?.status === "verde"
                                        ? "bg-green-500/10 text-green-500"
                                        : "bg-red-500/10 text-red-500"
                                }`}>
                                    <Globe size={16}/>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-white">Zoho Forms (Form 1)</p>
                                    <p className={`text-[10px] ${
                                        webhookStatus.zoho_form1?.status === "verde"
                                            ? "text-green-400"
                                            : "text-red-400"
                                    }`}>
                                        {webhookStatus.zoho_form1?.status === "verde" ? "Online" : "Error"}
                                    </p>
                                    {webhookStatus.zoho_form1?.razon && (
                                        <p className="text-[9px] text-slate-500 mt-0.5">
                                            {webhookStatus.zoho_form1.razon}
                                        </p>
                                    )}
                                </div>
                            </div>
                            
                            {/* Card Zoho Form 2 - Estado dinámico */}
                            <div className={`p-3 bg-slate-950 rounded-lg border flex items-center gap-3 ${
                                webhookStatus.zoho_form2?.status === "verde" 
                                    ? "border-green-500/50" 
                                    : "border-red-500/50"
                            }`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    webhookStatus.zoho_form2?.status === "verde"
                                        ? "bg-green-500/10 text-green-500"
                                        : "bg-red-500/10 text-red-500"
                                }`}>
                                    <Globe size={16}/>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-white">Zoho Forms (Form 2)</p>
                                    <p className={`text-[10px] ${
                                        webhookStatus.zoho_form2?.status === "verde"
                                            ? "text-green-400"
                                            : "text-red-400"
                                    }`}>
                                        {webhookStatus.zoho_form2?.status === "verde" ? "Online" : "Error"}
                                    </p>
                                    {webhookStatus.zoho_form2?.razon && (
                                        <p className="text-[9px] text-slate-500 mt-0.5">
                                            {webhookStatus.zoho_form2.razon}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                </div>
            </div>
            </div>
        );
        }

        // --- NUEVA VISTA: BUSQUEDA Y TRACKING ---
        function SearchView({ candidates, onSelect }) {
            const [searchTerm, setSearchTerm] = useState('');
            const [debouncedTerm, setDebouncedTerm] = useState('');  //agregado Debounce
            const [roleFilter, setRoleFilter] = useState('Todos');

            useEffect(() => {
                const timer = setTimeout(() => {
                    setDebouncedTerm(searchTerm);
                }, 300);
                return () => clearTimeout(timer); // Limpia el timer si el usuario sigue escribiendo
            }, [searchTerm]);
        
            // 3. Ahora filtramos usando 'debouncedTerm' en lugar de 'searchTerm'
           
            const results = candidates.filter(c => {
                const matchesText = c.nombre.toLowerCase().includes(debouncedTerm.toLowerCase()) || 
                                  c.email.toLowerCase().includes(debouncedTerm.toLowerCase());
                const matchesRole = roleFilter === 'Todos' || c.puesto.includes(roleFilter);
                return matchesText && matchesRole;
            });

            const roles = ['Todos', ...new Set(candidates.map(c => c.puesto))];

            return (
                <div className="h-full flex flex-col max-w-7xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-white">Búsqueda y Seguimiento</h1>
                        <p className="text-slate-400 text-sm mt-1">Localiza candidatos y revisa su estado actual.</p>
                    </div>

                    <div className="flex gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                            <input 
                                type="text" 
                                placeholder="Buscar por nombre o email..." 
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-blue-500 focus:outline-none"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select 
                            className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:border-blue-500 focus:outline-none"
                            value={roleFilter}
                            onChange={e => setRoleFilter(e.target.value)}
                        >
                            {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1">
                        <div className="overflow-y-auto h-full">
                            <table className="w-full text-left">
                                <thead className="bg-slate-950 text-xs uppercase text-slate-500 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4 font-bold">Candidato</th>
                                        <th className="p-4 font-bold">Etapa Actual</th>
                                        <th className="p-4 font-bold">Estado Detallado</th>
                                        <th className="p-4 font-bold text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {results.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-800/50 group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={c.nombre} size="sm"/>
                                                    <div>
                                                        <p className="font-bold text-sm text-white">{c.nombre}</p>
                                                        <p className="text-xs text-slate-500">{c.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <Badge type={c.stage === 'stage_3' ? 'green' : c.stage === 'trash' ? 'danger' : 'blue'}>
                                                    {c.stage === 'stage_1' ? 'Explorar' : c.stage === 'stage_2' ? 'Gestión' : c.stage === 'stage_3' ? 'Informes' : 'Papelera'}
                                                </Badge>
                                            </td>
                                            <td className="p-4 text-xs text-slate-400">
                                                {getStatusLabel(c.status_interno)}
                                            </td>
                                            <td className="p-4 text-right">
                                                <Button size="sm" variant="secondary" onClick={() => onSelect(c.id)}>
                                                    Ver Ficha
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {results.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-500 text-sm">
                                                No se encontraron resultados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            );
        }
        // --- VISTA DE CARGA MANUAL ---
        function ManualUploadModal({ isOpen, onClose, onUploadSuccess, currentUser }) {
    const [loading, setLoading] = React.useState(false);
    const [file, setFile] = React.useState(null);
    const [step, setStep] = React.useState(1); // 1 = analizar, 2 = confirmar
    const [puesto, setPuesto] = React.useState("");
    const [nombreExtraido, setNombreExtraido] = React.useState("");
    const [emailExtraido, setEmailExtraido] = React.useState("");
    
    // Lista de puestos disponibles
    const puestosDisponibles = [
        "Asistente Administrativo Inteligente",
        "Asistente de Arquitectura",
        "Asistente de Comunicacion Corporativa",
        "Asistente Financiero y Contable",
        "Asistente de Marketing Digital",
        "Asistente para E commerce",
        "Asistente para Desarrollo Web",
        "Asistente de Diseño Grafico",
        "Asistente de Automatizacion con IA",
        "Asistente de Gestion y Calidad",
        "Asistende de Recursos Humanos",
        "Asistente de Gestion de Procesos",
        "Asistente Diseñador/a de Productos e Interiores",
        "Asistente Técnico/a de Proyectos Acústicos",
        "Asistente de Atención al Cliente",
        "Asistente de Ventas y Prospección",
        "Asistente de Soporte Técnico/TI",
        "Asistente Valoración Inmobiliaria y Tasación",
        "Asistente Diseñador UX/UI",
        "Aistente Desarrollador/a Senior - Magnolia CMS",
        "Asistente Delineante técnico",
        "Asistente Ingeniero/a de Caminos",
        "Asistente de Gestion de Proyectos",
        "Asistente Virtual Ejecutiva",
        "Asistente Project Manager",
        "Asistente de Marketing con Elementor",
        "Asistente Especialista en Calidad con Power BI",
        "Asistente Ingeniero Mecatrónico/Automatización",
        "Asistente en Estrategia y Operaciones",
        "Asistente Financiero",
        "Asistente Desarrollador/a de Automatizaciones Zoho",
        "Asistente Aparejador / Arquitecto Técnico",
        "Asistente Comercial - Remodelariones, Reformas y Construcción",
        "Asistente Desarrollador Odoo + Shopify",
        "Asistente Programador web (Power BI + Integración ERP/CRM",
        "Asistente de Seguridad y Salud Laboral",
       
    ];
    
    if (!isOpen) return null;

    // Paso 1: Analizar CV con IA
    const handleAnalizar = async (e) => {
        e.preventDefault();
        if (!file || !puesto) {
            alert("❌ Por favor selecciona un puesto y sube el CV");
            return;
        }
        
        setLoading(true);
        const formData = new FormData();
        formData.append('cv', file);
        
        const result = await api.candidates.analizarCV(formData);
        if (result.ok) {
            setNombreExtraido(result.nombre || "");
            setEmailExtraido(result.email || "");
            setStep(2); // Pasar al paso 2
        } else {
            alert("❌ Error al analizar CV: " + (result.error || "No se pudo analizar"));
        }
        setLoading(false);
    };

    // Paso 2: Confirmar y crear candidato
    const handleConfirmar = async (e) => {
        e.preventDefault();
        if (!emailExtraido.trim()) {
            alert("❌ El email es obligatorio");
            return;
        }
        
        setLoading(true);
        const formData = new FormData();
        formData.append('cv', file);
        formData.append('puesto', puesto);
        formData.append('nombre', nombreExtraido);
        formData.append('email', emailExtraido.trim());
        formData.append('usuario_accion', currentUser || 'Sistema');
        
        const result = await api.candidates.manualUpload(formData);
        if (result.ok || result.id) {
            alert("✅ Candidato cargado con éxito");
            onUploadSuccess();
            onClose();
            // Resetear estado
            setStep(1);
            setFile(null);
            setPuesto("");
            setNombreExtraido("");
            setEmailExtraido("");
        } else {
            alert("❌ Error: " + (result.error || "No se pudo subir"));
        }
        setLoading(false);
    };

    const handleCancelar = () => {
        // Resetear estado al cancelar
        setStep(1);
        setFile(null);
        setPuesto("");
        setNombreExtraido("");
        setEmailExtraido("");
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
                <h2 className="text-xl font-bold text-white mb-4">Carga Manual de Candidato</h2>
                
                {step === 1 ? (
                    // PASO 1: Seleccionar puesto y subir CV
                    <form onSubmit={handleAnalizar} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">Puesto Objetivo</label>
                            <select 
                                value={puesto} 
                                onChange={e => setPuesto(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500"
                            >
                                <option value="">Selecciona un puesto...</option>
                                {puestosDisponibles.map((p, idx) => (
                                    <option key={idx} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                        <div className="border-2 border-dashed border-slate-800 rounded-xl p-4 text-center">
                            <input 
                                type="file" 
                                accept=".pdf" 
                                required 
                                onChange={e => setFile(e.target.files[0])} 
                                className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500" 
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button type="button" onClick={handleCancelar} className="flex-1 px-4 py-2 bg-slate-800 text-slate-400 rounded-lg text-sm font-bold">Cancelar</button>
                            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                                {loading ? "Extrayendo datos..." : "Extraer datos"}
                            </button>
                        </div>
                    </form>
                ) : (
                    // PASO 2: Mostrar datos extraídos y confirmar
                    <form onSubmit={handleConfirmar} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">Nombre Completo</label>
                            <input 
                                type="text" 
                                value={nombreExtraido} 
                                onChange={e => setNombreExtraido(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500" 
                                placeholder="Nombre Completo"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">Email <span className="text-yellow-400">* Este es el ID del candidato, presta atención</span></label>
                            <input 
                                type="email" 
                                value={emailExtraido} 
                                onChange={e => setEmailExtraido(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-sm outline-none focus:border-blue-500" 
                                placeholder="Email"
                            />
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400">
                            <strong>Puesto seleccionado:</strong> {puesto}
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button type="button" onClick={() => setStep(1)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-400 rounded-lg text-sm font-bold">Volver</button>
                            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                                {loading ? "Creando..." : "Confirmar y Crear"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

        // --- VISTA EXPLORAR TALENTO (CORREGIDA) ---
function ExploreView({ candidates, onSelect, onUpdate, loading, onAddClick }) {
    const [filter, setFilter] = useState('');
    const [debouncedFilter, setDebouncedFilter] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilter(filter);
        }, 300);
        return () => clearTimeout(timer);
    }, [filter]);

    

    


    // --- HELPERS INTERNOS (CORREGIDOS PARA FIREBASE) ---
    const parseFirebaseDate = (iso) => {
        if (!iso) return null;
        if (typeof iso === 'object' && iso._seconds) {
            return new Date(iso._seconds * 1000);
        }
        return new Date(iso);
    };

    const simpleDate = (iso) => {
        const d = parseFirebaseDate(iso);
        if (!d || isNaN(d.getTime())) return '-';
        return d.getDate() + ' ' + d.toLocaleString('es-ES', { month: 'short' });
    };

    const isToday = (iso) => {
        const d = parseFirebaseDate(iso);
        if (!d || isNaN(d.getTime())) return false;
        
        const today = new Date();
        return d.getDate() === today.getDate() && 
               d.getMonth() === today.getMonth() && 
               d.getFullYear() === today.getFullYear();
    };
    
    // 1. Ordenamiento Seguro (Nuevos arriba)
    const sortedCandidates = [...candidates].sort((a, b) => {
        const dateA = parseFirebaseDate(a.fecha) || new Date(0);
        const dateB = parseFirebaseDate(b.fecha) || new Date(0);
        return dateB - dateA;
    });
    
    // 2. Filtrado (ÚNICA DECLARACIÓN)
    const filtered = sortedCandidates.filter(c => 
        c.stage === 'stage_1' && 
        (c.nombre.toLowerCase().includes(debouncedFilter.toLowerCase()) || 
         c.puesto.toLowerCase().includes(debouncedFilter.toLowerCase()))
    );

    

    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto px-4">
            {/* CABECERA */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        Explorar Talento 
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-blue-400 text-sm font-bold border border-slate-700">
                            {filtered.length}
                        </span>
                    </h1>
                    <p className="text-slate-400 text-sm mt-2">Revisa los perfiles ingresados recientemente.</p>
                </div>
                
                <div className="flex gap-3 w-full md:w-auto items-center">
                    <div className="relative group flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                        <input 
                            type="text" 
                            placeholder="Buscar..." 
                            value={filter} 
                            onChange={(e) => setFilter(e.target.value)} 
                            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-300 focus:border-blue-500 focus:outline-none transition-all placeholder-slate-600"
                        />
                    </div>
                    {/* BOTÓN ESTILIZADO CON ICONO */}
                    <button 
                        onClick={onAddClick}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2 whitespace-nowrap active:scale-95"
                    >
                        <UserPlus size={22} />
                        
                    </button>
                </div>
            </div>

            {/* GRILLA DE TARJETAS */}
            {/* GRILLA DE TARJETAS CON SKELETON LOADERS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-10">
                {loading ? (
                    /* 1. Mientras carga, generamos 6 tarjetas de silueta (Skeletons) */
                    Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
                ) : (
                    /* 2. Cuando termina de cargar, mostramos los datos reales */
                    filtered.map(c => {
                        // Debug temporal: verificar origen
                        if (c.origen) {
                            console.log(`Candidato ${c.nombre} - origen:`, c.origen);
                        }
                        return (
                        <div 
                            key={c.id} 
                            onClick={() => onSelect(c.id)} 
                            className="bg-slate-900 border border-slate-800 rounded-xl p-6 cursor-pointer hover:border-slate-600 transition-all group relative flex flex-col justify-between min-h-[180px]"
                        >
                            {/* HEADER: PUESTO + SCORE */}
                            <div className="flex justify-between items-start mb-3">
                                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider max-w-[70%] leading-tight">
                                    {c.puesto || "CANDIDATURA GENERAL"}
                                </span>
                                
                                {/* Score Box */}
                                <div className={`flex items-center justify-center px-2 py-1 rounded border ${
                                    (c.ia_score || 0) >= 90 
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                }`}>
                                    <span className="text-xs font-bold">{c.ia_score || 0}</span>
                                </div>
                            </div>

                            {/* BODY: NOMBRE + ETIQUETAS */}
                            <div className="mb-6">
                                <h3 className="text-lg font-bold text-white group-hover:text-blue-100 transition-colors mb-2">
                                    {c.nombre || "Sin Nombre"}
                                </h3>
                                {/* Etiquetas: NUEVO y CARGA MANUAL */}
                                <div className="flex gap-2 flex-wrap">
                                    {isToday(c.fecha) && c.status_interno === 'new' && (
                                        <span className="inline-block px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded shadow-sm animate-pulse">
                                            NUEVO
                                        </span>
                                    )}
                                    {(c.origen === "carga_manual" || c.origen === "manual") && (
                                        <span className="inline-block px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded shadow-sm">
                                            CARGA MANUAL
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* FOOTER: FECHA */}
                            <div className="mt-auto border-t border-slate-800 pt-3">
                                <span className="text-xs text-slate-500 font-medium">
                                    {simpleDate(c.fecha)}
                                </span>
                            </div>
                        </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}


function ManageView({ candidates, onSelect, currentUser }) {
    const stage2 = candidates.filter(c => c.stage === 'stage_2');
    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto px-4">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">Gestión de Candidatos</h1>
                <p className="text-slate-400 text-sm mt-1">Etapa 2: Entrevistas y evaluación.</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
                <div className="overflow-y-auto custom-scrollbar flex-1">
                    <table className="w-full text-left border-collapse">
                        {/* Encabezado Sticky con fondo opaco */}
                        <thead className="bg-slate-950 text-xs uppercase text-slate-500 font-bold tracking-wider sticky top-0 z-20 border-b border-slate-800">
                            <tr>
                                <th className="px-6 py-4">Candidato</th>
                                <th className="px-6 py-4">Puesto</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4">Responsable</th>
                                <th className="px-6 py-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {stage2.length > 0 ? (
                                stage2.map(c => (
                                    <tr key={c.id} onClick={() => onSelect(c.id)} className="hover:bg-slate-800/60 cursor-pointer transition-colors group">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={c.nombre} />
                                                <div>
                                                    <span className="font-bold text-slate-200 text-sm group-hover:text-white">{c.nombre}</span>
                                                    <p className="text-[10px] text-slate-500">{c.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3"><span className="text-xs text-slate-400">{c.puesto}</span></td>
                                        <td className="px-6 py-3"><Badge type="blue">{getStatusLabel(c.status_interno)}</Badge></td>
                                        <td className="px-6 py-3">
                                            {c.assignedTo ? (
                                                <div className="flex items-center gap-2">
                                                    <Avatar name={c.assignedTo} size="sm"/>
                                                    <span className={`text-xs ${c.assignedTo === currentUser ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                                                        {c.assignedTo}
                                                    </span>
                                                </div>
                                            ) : <span className="text-xs text-slate-600 italic">Sin asignar</span>}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <ChevronRight size={16} className="ml-auto text-slate-600 group-hover:text-white transition-transform group-hover:translate-x-1"/>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 text-sm italic">
                                        No hay candidatos en etapa de gestión.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
// ==========================================
// 🗑️ VISTA PAPELERA (RECUPERACIÓN)
// ==========================================
function TrashView({ candidates, onUpdate }) {
    // Filtramos solo los que están en 'trash'
    const discarded = candidates.filter(c => c.stage === 'trash');

    return (
        <div className="h-full flex flex-col max-w-7xl mx-auto px-4">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Trash2 className="text-rose-500" /> Papelera de Reciclaje
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    Candidatos descartados. Puedes restaurarlos o ver el motivo de descarte.
                </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/50 text-xs uppercase text-slate-500 font-bold tracking-wider">
                        <tr>
                            <th className="px-6 py-4 border-b border-slate-800">Candidato</th>
                            <th className="px-6 py-4 border-b border-slate-800">Motivo de Descarte</th>
                            <th className="px-6 py-4 border-b border-slate-800 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {discarded.length === 0 ? (
                            <tr>
                                <td colSpan="3" className="p-8 text-center text-slate-500 italic">
                                    La papelera está vacía.
                                </td>
                            </tr>
                        ) : (
                            discarded.map(c => (
                                <tr key={c.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs">
                                                {c.nombre.charAt(0)}
                                            </div>
                                            <div>
                                                <span className="font-bold text-slate-300 text-sm block">{c.nombre}</span>
                                                <span className="text-[10px] text-slate-500">{c.puesto}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className="text-xs text-rose-300 bg-rose-900/10 px-2 py-1 rounded border border-rose-900/20">
                                            {c.notes || c.motivo || "Sin motivo especificado"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button 
                                            onClick={() => {
                                                if(confirm(`¿Restaurar a ${c.nombre} a la etapa de Exploración?`)) {
                                                    onUpdate(c.id, { stage: 'stage_1', status_interno: 'viewed', notes: "" });
                                                }
                                            }}
                                            className="text-xs font-bold text-emerald-500 hover:text-emerald-400 border border-emerald-900/30 bg-emerald-900/10 px-3 py-1.5 rounded hover:bg-emerald-900/20 transition-all"
                                        >
                                            <Undo2 size={14} className="inline mr-1"/> RESTAURAR
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
// ==========================================
// 📄 COMPONENTE: REPORTE PROFESIONAL (DISEÑO MEJORADO)
// ==========================================
const ProfessionalReport = ({ data, onBack, onEdit }) => {
    const [downloading, setDownloading] = React.useState(false);
    const [downloadingPDF, setDownloadingPDF] = React.useState(false);
    const reportRef = React.useRef(null);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const response = await fetch(`${API_URL}/download-docx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) throw new Error("Error generando el documento");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Informe_${data.nombre.replace(/\s+/g, '_')}.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error(error);
            alert("No se pudo descargar el archivo. Revisa la consola.");
        } finally {
            setDownloading(false);
        }
    };

    const handleDownloadPDF = async () => {
        setDownloadingPDF(true);
        try {
            // Cargar html2pdf.js dinámicamente si no existe (usando unpkg que está permitido en CSP)
            if (!window.html2pdf) {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
                script.onload = () => generatePDF();
                script.onerror = () => {
                    alert("Error cargando la librería PDF. Revisa la consola.");
                    setDownloadingPDF(false);
                };
                document.head.appendChild(script);
            } else {
                generatePDF();
            }
        } catch (error) {
            console.error(error);
            alert("No se pudo descargar el PDF. Revisa la consola.");
            setDownloadingPDF(false);
        }
    };

    const generatePDF = () => {
        const element = reportRef.current;
        if (!element) {
            setDownloadingPDF(false);
            return;
        }

        const opt = {
            margin: [10, 10, 10, 10],
            filename: `Informe_${data.nombre.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true,
                logging: false,
                letterRendering: true
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        window.html2pdf().set(opt).from(element).save().then(() => {
            setDownloadingPDF(false);
        }).catch((error) => {
            console.error(error);
            alert("Error generando PDF. Revisa la consola.");
            setDownloadingPDF(false);
        });
    };

    const getLevelColor = (nivel) => {
        const n = String(nivel).toLowerCase();
        if (n.includes('avanzado') || n.includes('experto') || n.includes('alto') || n.includes('nativo')) return 'bg-slate-900 text-white border-slate-900';
        if (n.includes('intermedio') || n.includes('medio') || n.includes('sólido')) return 'bg-slate-100 text-slate-800 border-slate-300';
        return 'bg-white text-slate-500 border-slate-200';
    };

    return (
        <div className="flex flex-col min-h-screen w-full bg-slate-900">
            
            {/* --- BARRA SUPERIOR FIJA --- */}
            <div className="flex justify-between items-center px-8 py-4 bg-slate-800 border-b border-slate-700 shadow-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors group">
                        <ArrowRight className="rotate-180 group-hover:-translate-x-1 transition-transform" size={24} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-white flex items-center gap-2">
                            Vista Previa del Informe
                            <span className="text-[10px] font-normal bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">A4 PREVIEW</span>
                        </h1>
                        <p className="text-xs text-slate-400">Revisa el contenido antes de exportar a Word.</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={onEdit} className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors border border-slate-600 hover:border-slate-500">
                        ✏️ Seguir Editando
                    </button>
                    <button 
                        onClick={handleDownloadPDF} 
                        disabled={downloadingPDF}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-emerald-900/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {downloadingPDF ? <Loader2 className="animate-spin" size={18}/> : <FileText size={18}/>}
                        {downloadingPDF ? "Generando..." : "Descargar PDF"}
                    </button>
                    <button 
                        onClick={handleDownload} 
                        disabled={downloading}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-900/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {downloading ? <Loader2 className="animate-spin" size={18}/> : <Download size={18}/>}
                        {downloading ? "Generando..." : "Descargar Word"}
                    </button>
                </div>
            </div>

            {/* --- CONTENEDOR PAPEL (SCROLLABLE) --- */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-8 px-4 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex justify-center">
                
                {/* HOJA A4 DIGITAL (TAMAÑO ESCALADO) */}
                <div ref={reportRef} className="bg-white text-slate-900 w-full max-w-[850px] shadow-2xl mx-auto mb-8 flex flex-col rounded-lg overflow-hidden">
                    
                    {/* ENCABEZADO ELEGANTE */}
                    <header className="px-10 sm:px-12 pt-10 sm:pt-12 pb-6 sm:pb-8 border-b-4 border-slate-900 mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 bg-slate-50">
                        <div className="flex-1">
                            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">
                                {data.nombre}
                            </h1>
                            <p className="text-base sm:text-lg text-slate-600 font-medium">{data.puesto}</p>
                        </div>
                        <div className="text-right">
                            <span className="inline-block bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-2">
                                Informe Confidencial
                            </span>
                            <p className="text-xs text-slate-400 font-medium whitespace-nowrap">
                                {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    </header>

                    {/* CUERPO DEL DOCUMENTO */}
                    <div className="px-10 sm:px-12 pb-10 sm:pb-12 space-y-6 sm:space-y-10 flex-1">

                        {/* 1. RESUMEN EJECUTIVO */}
                        <section>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                <span className="w-4 h-0.5 bg-slate-400"></span> Resumen Ejecutivo
                            </h3>
                            <p className="text-sm leading-7 text-slate-800 text-justify font-normal whitespace-pre-line border-l-2 border-slate-200 pl-4">
                                {data.resumen_ejecutivo || data.resumen_profesional || "Sin resumen disponible."}
                            </p>
                        </section>

                        {/* 2. FICHA TÉCNICA (GRID LIMPIO) */}
                        <section className="bg-slate-50 rounded-xl p-4 sm:p-6 border border-slate-100">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Ficha Técnica</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 sm:gap-y-6 gap-x-8 sm:gap-x-12">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Ubicación</span>
                                    <span className="text-sm font-bold text-slate-900 block">{data.ficha_tecnica?.ubicacion || "-"}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nivel de Inglés</span>
                                    <span className="text-sm font-bold text-slate-900 block">{data.ficha_tecnica?.nivel_ingles || "-"}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Experiencia / Seniority</span>
                                    <span className="text-sm font-bold text-slate-900 block">{data.ficha_tecnica?.nivel_experiencia || "-"}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Disponibilidad</span>
                                    <span className="text-sm font-bold text-slate-900 block">{data.ficha_tecnica?.disponibilidad || "-"}</span>
                                </div>
                            </div>
                        </section>

                        {/* 3. COLUMNAS: TÉCNICAS Y BLANDAS */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-12">
                            {/* Competencias Técnicas */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 border-b border-slate-200 pb-2">Competencias Técnicas</h3>
                                <ul className="space-y-2 sm:space-y-3">
                                    {(data.competencias_tecnicas || []).map((t, i) => (
                                        <li key={i} className="flex justify-between items-center text-sm gap-2 flex-wrap sm:flex-nowrap group">
                                            <span className="font-semibold text-slate-700">{t.competencia}</span>
                                            <span className={`text-[9px] px-2 py-0.5 rounded border uppercase font-bold tracking-wider whitespace-nowrap ${getLevelColor(t.nivel)}`}>
                                                {t.nivel}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Habilidades Blandas */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 border-b border-slate-200 pb-2">Soft Skills</h3>
                                <ul className="space-y-2 sm:space-y-3">
                                    {(data.habilidades_blandas || []).map((h, i) => (
                                        <li key={i} className="flex justify-between items-center text-sm gap-2 flex-wrap sm:flex-nowrap">
                                            <span className="font-semibold text-slate-700">{h.habilidad}</span>
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase whitespace-nowrap">
                                                {h.nivel}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* 4. HERRAMIENTAS (DISEÑO COMPACTO PARA PDF) */}
                        {(data.herramientas && data.herramientas.length > 0) && (
                            <section style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Stack Tecnológico</h3>
                                <div 
                                    className="flex flex-wrap gap-x-4 gap-y-2 items-center"
                                    style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                                >
                                    {data.herramientas.map((t, i) => (
                                        <span 
                                            key={i}
                                            className="inline-flex items-center gap-1.5 text-xs"
                                            style={{ pageBreakInside: 'avoid', breakInside: 'avoid', whiteSpace: 'nowrap' }}
                                        >
                                            <span className="font-bold text-slate-700">{t.herramienta}</span>
                                            <span className="text-slate-400">|</span>
                                            <span className="text-slate-400 font-medium text-[10px] uppercase">{t.nivel}</span>
                                        </span>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* 5. PLUS / OBSERVACIONES */}
                        <section className="bg-blue-50/50 p-4 sm:p-6 rounded-r-xl border-l-4 border-blue-600">
                            <h3 className="text-[10px] font-bold text-blue-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Sparkles size={12}/> Valor Agregado
                            </h3>
                            <p className="text-sm text-blue-900 italic leading-relaxed">
                                "{data.plus || "Sin observaciones adicionales."}"
                            </p>
                        </section>

                        {/* 6. CONCLUSIÓN FINAL */}
                        <section className="pt-4">
                            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-[0.2em] mb-3">Recomendación Final</h3>
                            <p className="text-sm text-slate-800 leading-relaxed text-justify font-medium">
                                {data.recomendacion_final || data.conclusion_final}
                            </p>
                        </section>

                    </div>

                    {/* PIE DE PÁGINA */}
                    <footer className="mt-auto px-10 sm:px-12 py-6 sm:py-8 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-2 opacity-50">
                            <div className="w-6 h-6 bg-slate-900 rounded-full"></div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Global Talent Connections</span>
                        </div>
                        <div className="text-left sm:text-right">
                            <p className="text-sm font-bold text-slate-900">{data.responsable}</p>
                            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Talent Acquisition Specialist</p>
                        </div>
                    </footer>

                </div>
            </div>
        </div>
    );
};

// =========================================================
// ⚡ VISTA REPORTE (CON AUTOGUARDADO ANTI-DESASTRES)
// =========================================================
function ReportView({ candidates, onUpdate, setCurrentReport }) {
    // ESTADOS INTERNOS
    const [view, setView] = React.useState('list'); 
    const [selectedCandidate, setSelectedCandidate] = React.useState(null);
    const [editorData, setEditorData] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [isGenerating, setIsGenerating] = React.useState(false);
    
    // ESTADOS PARA CARGA MANUAL
    const [showManual, setShowManual] = React.useState(false);
    const [manualFile, setManualFile] = React.useState(null);
    const [manualNotes, setManualNotes] = React.useState("");

    // ⚡ ESTADO NUEVO: Indicador de autoguardado
    const [autoSaveMsg, setAutoSaveMsg] = React.useState("");

    // ⚡ ESTADO PARA CRONOLOGÍA
    const [selectedCandidateForHistory, setSelectedCandidateForHistory] = React.useState(null);

    // ⚡ FUNCIÓN PARA EXPORTAR CRONOLOGÍA A CSV
    const handleExportHistory = () => {
        if (!selectedCandidateForHistory || !selectedCandidateForHistory.history || selectedCandidateForHistory.history.length === 0) {
            alert("No hay datos para exportar.");
            return;
        }

        const candidate = selectedCandidateForHistory;
        
        // Encabezados del CSV
        const headers = ['Nombre', 'Email', 'Puesto', 'Fecha y Hora', 'Evento', 'Detalles', 'Usuario'];
        
        // Convertir historial a filas CSV
        const rows = candidate.history.map(h => {
            const fecha = h.date ? new Date(h.date).toLocaleString('es-AR') : 'Fecha desconocida';
            return [
                candidate.nombre || 'Sin nombre',
                candidate.email || 'S/E',
                candidate.puesto || 'Sin puesto',
                fecha,
                h.event || 'Evento del sistema',
                (h.detail || 'Sin detalles adicionales.').replace(/"/g, '""'), // Escapar comillas
                h.usuario || 'Sistema'
            ];
        });
        
        // Crear contenido CSV
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        // Crear blob y descargar
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM para Excel
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (candidate.nombre || 'Candidato').replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
        a.download = `Cronologia_${safeName}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    // Filtrar candidatos listos (Etapa 3)
    const pipelineCandidates = candidates.filter(c => c.stage === 'stage_3');

    // ⚡ MAGIA 1: RECUPERAR BORRADOR AL INICIAR
    React.useEffect(() => {
        const savedDraft = localStorage.getItem('report_draft_manual_notes');
        const savedEditor = localStorage.getItem('report_draft_editor_data');
        
        if (savedDraft) {
            setManualNotes(savedDraft);
            setShowManual(true); // Abrimos el panel si había notas
            setAutoSaveMsg("Borrador de notas restaurado");
        }
        
        if (savedEditor) {
            setEditorData(JSON.parse(savedEditor));
            setView('editor'); // Vamos directo al editor si había datos
            setAutoSaveMsg("Informe en progreso restaurado");
        }

        // Limpiar mensaje después de 3 segs
        setTimeout(() => setAutoSaveMsg(""), 3000);
    }, []);

    // ⚡ MAGIA 2: AUTOGUARDADO DE NOTAS (Cada vez que escriben)
    React.useEffect(() => {
        if (manualNotes) {
            localStorage.setItem('report_draft_manual_notes', manualNotes);
        }
    }, [manualNotes]);

    // ⚡ MAGIA 3: AUTOGUARDADO DEL EDITOR (Si ya generó el informe)
    React.useEffect(() => {
        if (editorData) {
            localStorage.setItem('report_draft_editor_data', JSON.stringify(editorData));
        }
    }, [editorData]);

    // ⚡ MAGIA 4: LIMPIEZA (Función para borrar cuando terminamos exitosamente)
    const clearDrafts = () => {
        localStorage.removeItem('report_draft_manual_notes');
        localStorage.removeItem('report_draft_editor_data');
        setManualNotes("");
        setEditorData(null);
        setManualFile(null);
        setView('list');
    };

    // --- MANEJADOR DE UPLOAD MANUAL ---
    const handleManualUpload = async () => {
        if (!manualFile && !manualNotes) return alert("Por favor adjunta un CV o escribe notas.");
        
        setIsGenerating(true);
        const formData = new FormData();
        if (manualFile) formData.append("cv", manualFile);
        formData.append("notas", manualNotes);
        formData.append("puesto", "Perfil Analizado Manualmente");
        formData.append("responsable", "Admin");

        try {
            const res = await fetch(`${API_URL}/manual-upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error("Error en el servidor");
            
            const data = await res.json();
            
            // Al tener éxito, guardamos el editorData (Magia 3 se activa sola) y borramos las notas crudas viejas
            setEditorData(data);
            setSelectedCandidate({ nombre: data.nombre || "Candidato Manual", puesto: data.puesto }); 
            setView('editor'); 
            
            // Opcional: Borramos el draft de notas crudas porque ya tenemos el procesado
            localStorage.removeItem('report_draft_manual_notes');

        } catch (e) {
            console.error(e);
            alert("Ocurrió un error al procesar el archivo. Revisa la consola.");
        } finally {
            setIsGenerating(false);
        }
    };

    // --- ABRIR CANDIDATO DEL PIPELINE ---
    const handleOpenCandidate = async (candidate) => {
        setLoading(true);
        try {
            let initialData = candidate.informe_final_data;
            if (!initialData) {
                const res = await api.reports.generate(candidate.id);
                initialData = res;
            }
            if (!initialData) {
                initialData = {
                    nombre: candidate.nombre,
                    puesto: candidate.puesto,
                    resumen_ejecutivo: "Generando resumen...",
                    ficha_tecnica: {},
                    competencias_tecnicas: [],
                    habilidades_blandas: [],
                    herramientas: [],
                    plus: "",
                    formacion_sugerida: "",
                    conclusion_final: "",
                    responsable: "Admin"
                };
            }
            setEditorData(initialData);
            setSelectedCandidate(candidate);
            setView('editor');
        } catch (e) {
            console.error(e);
            alert("Error cargando datos del candidato.");
        } finally {
            setLoading(false);
        }
    };

    // --- GUARDAR CAMBIOS ---
    const handleSaveEditor = async () => {
        setView('preview');
    };

    // =========================================================
    // RENDER: 1. VISTA PREVIA (HOJA A4)
    // =========================================================
    if (view === 'preview') {
        return (
            <ProfessionalReport 
                data={editorData} 
                onBack={() => setView('editor')} 
                onEdit={() => setView('editor')} 
                // Pasamos la función de limpieza al componente de reporte si descarga OK
                // (Opcional: podrías limpiar acá si consideras que llegar al preview es "terminar")
            />
        );
    }

    // =========================================================
    // RENDER: 2. EDITOR V3 (CON TODOS LOS CAMPOS)
    // =========================================================
    if (view === 'editor') {
        return (
            <div className="max-w-7xl mx-auto h-[calc(100vh-100px)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* Header Editor */}
                <div className="flex justify-between items-center mb-4 px-1">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            Editando Informe
                            {/* ⚡ INDICADOR VISUAL DE GUARDADO */}
                            <span className="text-[10px] font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">
                                Autoguardado activo
                            </span>
                        </h2>
                        <p className="text-slate-400 text-xs">Candidato: {editorData.nombre}</p>
                    </div>
                    <div className="flex gap-2">
                        {/* ⚡ Botón de Cancelar ahora limpia el borrador explícitamente */}
                        <button onClick={() => { 
                            if(confirm("¿Descartar cambios y salir?")) clearDrafts(); 
                        }} className="px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors">
                            Descartar y Salir
                        </button>
                        
                        <button onClick={handleSaveEditor} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                            <Eye size={16}/> Previsualizar
                        </button>
                    </div>
                </div>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
                    {/* COLUMNA IZQUIERDA: FORMULARIOS */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-y-auto custom-scrollbar p-6 space-y-6">
                        
                        {/* 1. Resumen */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase">Resumen Ejecutivo</label>
                            <textarea 
                                className="w-full h-32 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none resize-none"
                                value={editorData.resumen_ejecutivo || editorData.resumen_profesional || ""}
                                onChange={(e) => setEditorData({...editorData, resumen_ejecutivo: e.target.value})}
                            />
                        </div>

                        {/* 2. Ficha Técnica */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase">Ficha Técnica</label>
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder="Ubicación" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" 
                                    value={editorData.ficha_tecnica?.ubicacion || ""} 
                                    onChange={(e) => setEditorData({...editorData, ficha_tecnica: {...editorData.ficha_tecnica, ubicacion: e.target.value}})} />
                                <input placeholder="Experiencia" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" 
                                    value={editorData.ficha_tecnica?.nivel_experiencia || ""} 
                                    onChange={(e) => setEditorData({...editorData, ficha_tecnica: {...editorData.ficha_tecnica, nivel_experiencia: e.target.value}})} />
                                <input placeholder="Inglés" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" 
                                    value={editorData.ficha_tecnica?.nivel_ingles || editorData.ficha_tecnica?.idiomas || ""} 
                                    onChange={(e) => setEditorData({...editorData, ficha_tecnica: {...editorData.ficha_tecnica, nivel_ingles: e.target.value}})} />
                                <input placeholder="Disponibilidad" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" 
                                    value={editorData.ficha_tecnica?.disponibilidad || ""} 
                                    onChange={(e) => setEditorData({...editorData, ficha_tecnica: {...editorData.ficha_tecnica, disponibilidad: e.target.value}})} />
                            </div>
                        </div>

                        {/* 3. Competencias Técnicas */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase flex justify-between">
                                Competencias Técnicas
                                <button onClick={() => setEditorData({...editorData, competencias_tecnicas: [...(editorData.competencias_tecnicas||[]), {competencia: "", nivel: "Alto"}]})} className="text-emerald-400 hover:text-emerald-300">+ Agregar</button>
                            </label>
                            {(editorData.competencias_tecnicas || []).map((c, i) => (
                                <div key={i} className="flex gap-2">
                                    <input className="flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" value={c.competencia} 
                                        onChange={(e) => {
                                            const newArr = [...editorData.competencias_tecnicas];
                                            newArr[i].competencia = e.target.value;
                                            setEditorData({...editorData, competencias_tecnicas: newArr});
                                        }} />
                                    <input className="w-24 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" value={c.nivel}
                                        onChange={(e) => {
                                            const newArr = [...editorData.competencias_tecnicas];
                                            newArr[i].nivel = e.target.value;
                                            setEditorData({...editorData, competencias_tecnicas: newArr});
                                        }} />
                                    <button onClick={() => {
                                        const newArr = editorData.competencias_tecnicas.filter((_, idx) => idx !== i);
                                        setEditorData({...editorData, competencias_tecnicas: newArr});
                                    }} className="text-rose-500 px-2">×</button>
                                </div>
                            ))}
                        </div>

                        {/* 4. Soft Skills (NUEVO V3) */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase flex justify-between">
                                Habilidades Blandas
                                <button onClick={() => setEditorData({...editorData, habilidades_blandas: [...(editorData.habilidades_blandas||[]), {habilidad: "", nivel: "Alto"}]})} className="text-emerald-400 hover:text-emerald-300">+ Agregar</button>
                            </label>
                            {(editorData.habilidades_blandas || []).map((h, i) => (
                                <div key={i} className="flex gap-2">
                                    <input className="flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" value={h.habilidad} 
                                        onChange={(e) => {
                                            const newArr = [...(editorData.habilidades_blandas||[])];
                                            newArr[i].habilidad = e.target.value;
                                            setEditorData({...editorData, habilidades_blandas: newArr});
                                        }} />
                                    <input className="w-24 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" value={h.nivel}
                                        onChange={(e) => {
                                            const newArr = [...(editorData.habilidades_blandas||[])];
                                            newArr[i].nivel = e.target.value;
                                            setEditorData({...editorData, habilidades_blandas: newArr});
                                        }} />
                                    <button onClick={() => {
                                        const newArr = (editorData.habilidades_blandas||[]).filter((_, idx) => idx !== i);
                                        setEditorData({...editorData, habilidades_blandas: newArr});
                                    }} className="text-rose-500 px-2">×</button>
                                </div>
                            ))}
                        </div>

                        {/* 5. Herramientas (NUEVO V3) */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase flex justify-between">
                                Herramientas
                                <button onClick={() => setEditorData({...editorData, herramientas: [...(editorData.herramientas||[]), {herramienta: "", nivel: "Avanzado"}]})} className="text-emerald-400 hover:text-emerald-300">+ Agregar</button>
                            </label>
                            {(editorData.herramientas || []).map((t, i) => (
                                <div key={i} className="flex gap-2">
                                    <input className="flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" value={t.herramienta} 
                                        onChange={(e) => {
                                            const newArr = [...(editorData.herramientas||[])];
                                            newArr[i].herramienta = e.target.value;
                                            setEditorData({...editorData, herramientas: newArr});
                                        }} />
                                    <input className="w-24 bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white" value={t.nivel}
                                        onChange={(e) => {
                                            const newArr = [...(editorData.herramientas||[])];
                                            newArr[i].nivel = e.target.value;
                                            setEditorData({...editorData, herramientas: newArr});
                                        }} />
                                    <button onClick={() => {
                                        const newArr = (editorData.herramientas||[]).filter((_, idx) => idx !== i);
                                        setEditorData({...editorData, herramientas: newArr});
                                    }} className="text-rose-500 px-2">×</button>
                                </div>
                            ))}
                        </div>

                        {/* 6. Plus */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase">Plus / Valor Agregado</label>
                            <textarea 
                                className="w-full h-20 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none resize-none"
                                value={editorData.plus || ""}
                                onChange={(e) => setEditorData({...editorData, plus: e.target.value})}
                            />
                        </div>

                        {/* 7. Formación Sugerida */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase">Formación Sugerida</label>
                            <textarea 
                                className="w-full h-20 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none resize-none"
                                value={editorData.formacion_sugerida || ""}
                                onChange={(e) => setEditorData({...editorData, formacion_sugerida: e.target.value})}
                            />
                        </div>

                        {/* 8. Recomendación */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-blue-400 uppercase">Recomendación Final</label>
                            <textarea 
                                className="w-full h-24 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:border-blue-500 outline-none resize-none"
                                value={editorData.recomendacion_final || editorData.conclusion_final || ""}
                                onChange={(e) => setEditorData({...editorData, recomendacion_final: e.target.value})}
                            />
                        </div>

                    </div>

                    {/* COLUMNA DERECHA: PREVIEW COMPACTA */}
                    <div className="bg-white rounded-xl overflow-hidden shadow-xl hidden lg:block opacity-90 pointer-events-none transform scale-[0.85] origin-top border-4 border-slate-800">
                        <div className="p-10 text-black">
                            <h1 className="text-xl font-bold">{editorData.nombre}</h1>
                            <p className="text-sm text-gray-500 mb-4">{editorData.puesto}</p>
                            <p className="text-xs text-gray-800 line-clamp-6 mb-4">{editorData.resumen_ejecutivo}</p>
                            <div className="p-4 bg-gray-100 rounded border border-gray-300 text-center text-gray-500 text-xs uppercase font-bold tracking-widest">
                                Vista Previa del Documento
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // =========================================================
    // RENDER: 3. VISTA CRONOLOGÍA (MODAL)
    // =========================================================
    if (selectedCandidateForHistory) {
        return (
            <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <History size={20}/> Cronología de Movimientos
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            {selectedCandidateForHistory.nombre} - {selectedCandidateForHistory.puesto || "Candidato"}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {selectedCandidateForHistory.history && selectedCandidateForHistory.history.length > 0 && (
                            <button 
                                onClick={handleExportHistory}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Download size={16}/> Exportar CSV
                            </button>
                        )}
                        <button 
                            onClick={() => setSelectedCandidateForHistory(null)}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-lg transition-colors"
                        >
                            Volver
                        </button>
                    </div>
                </div>

                <Card className="bg-slate-900 border-slate-800 p-8">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <History size={16}/> Historial de Movimientos
                    </h3>
                    
                    {!selectedCandidateForHistory.history || selectedCandidateForHistory.history.length === 0 ? (
                        <div className="text-center py-10 border-2 border-dashed border-slate-800 rounded-xl">
                            <p className="text-slate-500 text-sm">No hay movimientos registrados aún.</p>
                        </div>
                    ) : (
                        <div className="relative border-l-2 border-slate-800 ml-3 space-y-8 pl-8 py-2">
                            {selectedCandidateForHistory.history.map((h, idx) => (
                                <div key={idx} className="relative group">
                                    <div className="absolute -left-[39px] top-1 w-5 h-5 rounded-full bg-slate-900 border-2 border-blue-500 z-10 group-hover:scale-125 transition-transform shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                                            {h.date ? new Date(h.date).toLocaleString('es-AR') : 'Fecha desconocida'}
                                        </span>
                                        <h4 className="text-white font-bold text-sm">{h.event || 'Evento del sistema'}</h4>
                                        <p className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800 inline-block mt-1">
                                            {h.detail || 'Sin detalles adicionales.'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    // =========================================================
    // RENDER: 4. LISTA PIPELINE Y CARGA MANUAL (DEFAULT)
    // =========================================================
    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            
            {/* CABECERA */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Generar Informe Final</h1>
                    <p className="text-slate-400 text-sm">Gestión de entregables y cierre de procesos.</p>
                    {/* ⚡ MENSAJE DE RESTAURACIÓN SI APLICA */}
                    {autoSaveMsg && (
                        <div className="mt-2 text-xs font-bold text-emerald-400 flex items-center gap-1 animate-pulse">
                            <Clock size={12}/> {autoSaveMsg}
                        </div>
                    )}
                </div>
                <button 
                    onClick={() => setShowManual(!showManual)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${showManual ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                >
                    {showManual ? "✕ CERRAR MODO MANUAL" : "⚡ MODO MANUAL"}
                </button>
            </div>

            {/* ZONA MANUAL (Diseño Gold Premium) */}
            {showManual && (
                <section className="bg-slate-900 border border-amber-500/20 rounded-2xl p-8 shadow-2xl animate-in slide-in-from-top duration-300 mb-8 relative overflow-hidden">
                    {/* Efecto de brillo de fondo */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                        
                        {/* COLUMNA IZQUIERDA: PDF */}
                        <div className="flex flex-col gap-3">
                            <label className="text-[11px] font-bold text-amber-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <FileText size={14}/> 1. Adjuntar Currículum (PDF)
                            </label>
                            
                            {/* ⚡ AVISO DE ARCHIVO NO PERSISTENTE */}
                            <label className={`flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-xl cursor-pointer transition-all group ${manualFile ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-950 hover:bg-slate-900 hover:border-slate-700'}`}>
                                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                                    <div className={`mb-3 p-3 rounded-full transition-all ${manualFile ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-500 group-hover:text-amber-500'}`}>
                                        {manualFile ? <CheckCircle size={24}/> : <Download size={24}/>}
                                    </div>
                                    <p className={`text-sm font-medium ${manualFile ? 'text-amber-400' : 'text-slate-400'}`}>
                                        {manualFile ? manualFile.name : "Click para buscar PDF o TXT"}
                                    </p>
                                    {!manualFile && <p className="text-xs text-slate-600 mt-1">Si recargas la página, deberás subirlo de nuevo.</p>}
                                </div>
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    accept=".pdf,.txt,.doc,.docx" 
                                    onChange={(e) => setManualFile(e.target.files[0])} 
                                />
                            </label>
                        </div>

                        {/* COLUMNA DERECHA: NOTAS */}
                        <div className="flex flex-col gap-3">
                            <label className="text-[11px] font-bold text-amber-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Sparkles size={14}/> 2. Notas y Análisis (Autoguardado)
                            </label>
                            <textarea 
                                className="w-full h-56 bg-slate-950 border border-slate-800 rounded-xl p-5 text-sm text-slate-200 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 focus:outline-none transition-all resize-none custom-scrollbar leading-relaxed placeholder-slate-700"
                                placeholder="Pega aquí tu evaluación. Si se corta internet, este texto se guarda solo."
                                value={manualNotes}
                                onChange={(e) => setManualNotes(e.target.value)}
                            />
                        </div>

                        {/* BOTÓN DE ACCIÓN */}
                        <div className="md:col-span-2 mt-2">
                            <button 
                                className={`w-full py-4 font-black text-sm uppercase tracking-[0.15em] rounded-xl flex items-center justify-center gap-3 transition-all transform active:scale-[0.99] shadow-lg ${
                                    isGenerating 
                                    ? 'bg-slate-800 text-slate-500 cursor-wait' 
                                    : 'bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-amber-50 shadow-amber-900/20 border border-amber-500/20'
                                }`}
                                disabled={isGenerating || (!manualFile && !manualNotes)}
                                onClick={handleManualUpload}
                            >
                                {isGenerating ? (
                                    <><Loader2 className="animate-spin" size={20}/> ANALIZANDO CON GEMINI...</>
                                ) : (
                                    <><Sparkles size={20}/> GENERAR FICHA DE INFORME FINAL </>
                                )}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {/* LISTA DEL PIPELINE */}
            <section className="space-y-4 pt-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Candidatos en Espera ({pipelineCandidates.length})</h3>
                {pipelineCandidates.length === 0 ? (
                    <div className="p-8 border border-slate-800 border-dashed rounded-xl text-center text-slate-600 text-sm">
                        No hay candidatos pendientes en esta etapa.
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {pipelineCandidates.map(c => (
                            <div key={c.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between hover:bg-slate-800/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                                        {c.nombre.substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{c.nombre}</h4>
                                        <p className="text-[10px] text-slate-500">{c.puesto || "Candidato"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => setSelectedCandidateForHistory(c)}
                                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <History size={14}/> Ver Cronología
                                    </button>
                                    {c.informe_final_data ? (
                                        <button 
                                            onClick={() => handleOpenCandidate(c)}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                                        >
                                            <Eye size={14}/> Ver Informe
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleOpenCandidate(c)}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                                        >
                                            <FileText size={14}/> Generar Informe
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
// --- VISTA DETALLE MEJORADA (CON GESTIÓN DE ENTREVISTA + CHECKLIST) ---
function CandidateDetail({ candidate, onBack, onUpdate, currentUser }) {
    const [noteInput, setNoteInput] = useState(candidate.notes || "");
    const [isEditing, setIsEditing] = useState(false);
    const [newCvLink, setNewCvLink] = useState(candidate.cv_url || "");
    const [newVideoLink, setNewVideoLink] = useState(candidate.video_url || "");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState('gestion');
    const [showResenaCV, setShowResenaCV] = useState(false);

    // ESTADOS PARA EL MODAL DE DESCARTE (TU CÓDIGO ORIGINAL)
    const [showDiscardModal, setShowDiscardModal] = useState(false);
    const [discardReason, setDiscardReason] = useState("");

    // --- NUEVOS ESTADOS: GESTIÓN DE ENTREVISTA (STAGE 2) ---
    const [meetLink, setMeetLink] = useState(candidate.meet_link || "");
    const [transcript, setTranscript] = useState(candidate.interview_transcript || "");
    const [form2Status, setForm2Status] = useState(candidate.process_step_2_form || "pending"); // pending, sent, received
    const [finalResult, setFinalResult] = useState(candidate.process_step_3_result || null); // qualified, disqualified

    // 🔥 SINCRONIZAR ESTADOS CUANDO CANDIDATE CAMBIA (para que persistan después de F5)
    React.useEffect(() => {
        if (candidate.meet_link) {
            setMeetLink(candidate.meet_link);
        }
        // Solo actualizar transcript si NO está analizada (para no sobrescribir el estado "ANALIZADA")
        if (candidate.interview_transcript && !candidate.transcripcion_entrevista) {
            setTranscript(candidate.interview_transcript);
        }
        // Sincronizar estado del formulario 2 (cuando el webhook actualiza desde el backend)
        if (candidate.process_step_2_form) {
            setForm2Status(candidate.process_step_2_form);
        }
        // Sincronizar resultado final si existe
        if (candidate.process_step_3_result) {
            setFinalResult(candidate.process_step_3_result);
        }
    }, [candidate.meet_link, candidate.interview_transcript, candidate.transcripcion_entrevista, candidate.process_step_2_form, candidate.process_step_3_result]);

    // Recuperar alertas y skills
    const flags = candidate.ia_alertas || candidate.alerts || [];
    const hardSkills = candidate.respuestas_filtro?.herramientas 
        ? (Array.isArray(candidate.respuestas_filtro.herramientas) 
            ? candidate.respuestas_filtro.herramientas 
            : candidate.respuestas_filtro.herramientas.split(',').map(s => s.trim()))
        : ['Sin datos técnicos'];

    // --- ACCIONES EXISTENTES ---
    const saveLinks = async () => {
        // Si se está agregando o cambiando el video, activar loader
        const videoCambio = newVideoLink && newVideoLink !== candidate.video_url;
        
        if (videoCambio) {
            setIsAnalyzingVideo(true);
        }
        
        // Guardar los links
        await onUpdate(candidate.id, { 
            cv_url: newCvLink, 
            video_url: newVideoLink,
            usuario_accion: currentUser || 'Sistema'
        });
        setIsEditing(false);
        
        // Si hay video, esperar a que termine el análisis y refrescar datos
        if (videoCambio) {
            // Esperar un tiempo razonable para que el backend procese el video
            // Hacemos polling cada 2 segundos para ver si el score cambió
            let intentos = 0;
            const maxIntentos = 15; // 30 segundos máximo (15 * 2s)
            const scoreInicial = candidate.ia_score || 0;
            
            const checkVideoAnalysis = setInterval(async () => {
                intentos++;
                
                try {
                    // Recargar datos del candidato desde la API
                    const apiClient = window.api || api;
                    const lista = await apiClient.candidates.list();
                    const candidatoActualizado = lista.find(c => c.id === candidate.id);
                    
                    if (candidatoActualizado) {
                        // Verificar si el score cambió o si hay reseña_video
                        const scoreNuevo = candidatoActualizado.ia_score || 0;
                        const tieneResenaVideo = candidatoActualizado.reseña_video || candidatoActualizado.reseñaVideo;
                        
                        // Si el score cambió o hay reseña de video, el análisis terminó
                        if (scoreNuevo !== scoreInicial || tieneResenaVideo || intentos >= maxIntentos) {
                            clearInterval(checkVideoAnalysis);
                            setIsAnalyzingVideo(false);
                            
                            // Actualizar el candidato en el estado
                            onUpdate(candidate.id, {
                                ia_score: candidatoActualizado.ia_score,
                                ia_motivos: candidatoActualizado.ia_motivos,
                                reseña_video: candidatoActualizado.reseña_video || candidatoActualizado.reseñaVideo,
                                video_url: candidatoActualizado.video_url
                            });
                            
                            if (intentos >= maxIntentos) {
                                alert("⚠️ El análisis del video está tomando más tiempo del esperado. Los datos se actualizarán automáticamente cuando termine.");
                            } else {
                                // Mostrar mensaje de éxito
                                console.log(`✅ Video analizado. Score: ${scoreInicial} → ${scoreNuevo}`);
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error verificando análisis de video:", error);
                    if (intentos >= maxIntentos) {
                        clearInterval(checkVideoAnalysis);
                        setIsAnalyzingVideo(false);
                    }
                }
            }, 2000); // Verificar cada 2 segundos
        }
    };

    const handleApprove = () => {
        onUpdate(candidate.id, { 
            stage: 'stage_2', 
            status_interno: 'interview_pending',
            assignedTo: currentUser 
        });
    };
    // --- 6. FUNCIÓN DE RE-ANÁLISIS (CONECTADA AL BACKEND) ---
    const handleAnalyzeInterview = async () => {
        // Validación básica
        if (!transcript || transcript.length < 10) {
            return alert("⚠️ Por favor, escribe o pega notas de la entrevista antes de analizar.");
        }
        
        setIsAnalyzing(true); // Activa el loader
        try {
            // DEBUG
            console.log("DEBUG - ID Candidato:", candidate.id);
            const targetURL = `${API_URL}/candidatos/${candidate.id}/analizar-entrevista`;
            console.log("DEBUG - URL Objetivo:", targetURL);
            // Llamamos al endpoint "Cerebro" que creamos en el backend
            const res = await fetch(`${API_URL}/candidatos/${candidate.id}/analizar-entrevista`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript })
            });
            
            if (!res.ok) throw new Error("Error en la conexión con la IA");
            
            const data = await res.json();
            
            // Actualizamos la vista visualmente al instante
            // El backend ya guarda la transcripción en transcripcion_entrevista
            onUpdate(candidate.id, { 
                ia_score: data.score, 
                ia_motivos: data.motivos,
                ia_alertas: data.alertas,
                transcripcion_entrevista: transcript // Guardar también en el frontend para que se muestre como "ANALIZADA"
            });
            
            alert(`✅ Análisis completado.\nNuevo Score: ${data.score}/100`);
            
        } catch (error) {
            console.error(error);
            alert("❌ Ocurrió un error al analizar la entrevista. Revisa la consola.");
        } finally {
            setIsAnalyzing(false); // Desactiva el loader
        }
    };

    const confirmDiscard = () => {
        if (!discardReason.trim()) return alert("Por favor escribe un motivo.");
        onUpdate(candidate.id, { 
            stage: 'trash', 
            motivo: discardReason, 
            notes: discardReason   
        });
        setShowDiscardModal(false);
    };

    // --- NUEVAS ACCIONES (STAGE 2) ---
    
    // 1. Guardar Link Meet (al salir del campo)
    const saveMeetLink = () => {
        const linkToSave = meetLink || candidate.meet_link;
        if (linkToSave && linkToSave !== candidate.meet_link) {
            onUpdate(candidate.id, { meet_link: linkToSave });
        }
    };

    // 2. Guardar Transcripción (misma lógica que saveLinks)
    const saveTranscript = () => {
        onUpdate(candidate.id, { interview_transcript: transcript });
    };

// ==========================================
   // 📧 FUNCIONES DE CORREO (FORZANDO GMAIL WEB)
   // ==========================================


  // 1. ABRIR GMAIL PARA LA ENTREVISTA (MEET)
  const handleOpenMail = async () => {
    // Usar el link guardado o el del estado local
    const linkToUse = candidate.meet_link || meetLink;
    if (!linkToUse) return alert("⚠️ Primero pega el link de la reunión en el campo de texto para incluirlo en el correo.");
    
    const recipient = candidate.email;
    // Asunto Dinámico
    const subject = encodeURIComponent(`¡Confirmación de Entrevista! – Posición: ${candidate.puesto} 🚀`);
    
    // Cuerpo del mensaje con Variables Dinámicas y Formato de Texto
    const body = encodeURIComponent(
`Hola, ${candidate.nombre}:


Espero que estés teniendo un excelente día.
Nos complace informarte que hemos revisado tu perfil y nos encantaría conocerte mejor. Por ello, te confirmamos los detalles para tu entrevista con nuestro equipo de selección:


📍 Link de conexión (Google Meet): ${linkToUse}
📅 Fecha y Hora: [Insertar Fecha y Hora]


RECOMENDACIONES PARA TU ENTREVISTA:
- Asegúrate de contar con una conexión estable a internet.
- Te sugerimos conectarte unos minutos antes desde un lugar tranquilo y sin ruido ambiente.
- ¡Sé tú mismo! Queremos conocer tu potencial y experiencia de cerca.


Por favor, confírmanos tu asistencia aceptando el meet. Si llegaras a tener algún inconveniente con el horario, avísanos con antelación para intentar reprogramar.


¡Estamos ansiosos por conversar contigo!


Saludos,
${currentUser || 'Equipo de Selección'}
Equipo de Selección | Global Talent Connections`
    );
    
    // Abrir Gmail en pestaña nueva
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}&body=${body}`;
    window.open(gmailUrl, '_blank');
    
    // Registrar evento en la cronología
    try {
        await onUpdate(candidate.id, {
            mail_meet_enviado: true,
            usuario_accion: currentUser || 'Sistema'
        });
    } catch (error) {
        console.error("Error registrando evento de mail:", error);
    }
};



// 2. ABRIR GMAIL PARA EL FORMULARIO 2 (Evaluación Técnica)
const handleSendForm2 = () => {
    // Guardar estado "sent" en la BD (misma lógica que updateChecklist pero directo)
    setForm2Status('sent');
    onUpdate(candidate.id, { process_step_2_form: 'sent', usuario_accion: currentUser });
   
    const recipient = candidate.email;
    const subject = encodeURIComponent(`Próximos pasos: Evaluación de Competencias – Global Talent Connections`);
   
    // Cuerpo del mensaje con el Link de Zoho Fijo y Formato de Lista
    const body = encodeURIComponent(
`Hola, ${candidate.nombre}:


Fue un gusto conversar contigo en la entrevista previa.
Para continuar con tu proceso de selección, el siguiente paso es completar una breve validación de competencias técnicas y conductuales. Esto nos permitirá conocer más a fondo tu perfil y alinearlo con los requerimientos de la posición.


📍 Puedes acceder al formulario aquí:
👉 https://forms.zohopublic.eu/globaltalentconnection1/form/ValidacionAsistentes/formperma/g9ttDk7Jj0cHyTgIRH_CdUcD7I5kHhTWL9XCpKWOeB0


CONSIDERACIONES IMPORTANTES:
- El formulario incluye preguntas sobre tu experiencia, compromiso, herramientas y autogestión.
- Te recomendamos completarlo con sinceridad y detalle.
- Una vez enviado, nuestro equipo revisará tus respuestas para notificarte la siguiente etapa.


Agradecemos tu tiempo y dedicación en este proceso. Quedamos atentos a tus respuestas para seguir avanzando.


Saludos cordiales,
${currentUser || 'Equipo de Selección'}
Equipo de Selección | Global Talent Connections`
    );
   
    // Abrimos Gmail Web en pestaña nueva
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}&body=${body}`;
    window.open(gmailUrl, '_blank');
};



    // 4. Actualizar Checklist
    const updateChecklist = (field, value) => {
        if (field === 'form2') setForm2Status(value);
        if (field === 'result') setFinalResult(value);
        
        const payload = {};
        if (field === 'form2') payload.process_step_2_form = value;
        if (field === 'result') payload.process_step_3_result = value;
        onUpdate(candidate.id, payload);
    };

    // 5. Pasar a Informe (Solo si cumple requisitos)
    const handleMoveToReport = () => {
        if (!meetLink || form2Status !== 'received' || finalResult !== 'qualified') {
            return alert("⚠️ Para avanzar, debes completar: Link de Meet, Formulario Recibido y Calificación Positiva.");
        }
        onUpdate(candidate.id, { 
            stage: 'stage_3', 
            status_interno: 'ready_for_report'
        });
    };

    // Validación visual para habilitar botón
    const isStage2Complete = meetLink && form2Status === 'received' && finalResult === 'qualified';

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right duration-300 pb-10 max-w-7xl mx-auto px-4 relative">
            
            {/* --- MODAL DE DESCARTE (INTACTO) --- */}
            {showDiscardModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-rose-900/50 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
                        <button onClick={() => setShowDiscardModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
                        
                        <div className="flex items-center gap-3 mb-4 text-rose-500">
                            <Trash2 size={24} />
                            <h3 className="text-xl font-bold text-white">Descartar Candidato</h3>
                        </div>
                        
                        <p className="text-slate-400 text-sm mb-4">
                            Estás a punto de mover a <strong className="text-white">{candidate.nombre}</strong> a la papelera. 
                            Por favor, indica el motivo para futuras referencias.
                        </p>

                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Motivo del descarte</label>
                        <textarea 
                            className="w-full h-24 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:border-rose-500 focus:outline-none resize-none mb-6"
                            placeholder="Ej: Salario fuera de rango, no tiene inglés..."
                            value={discardReason}
                            onChange={(e) => setDiscardReason(e.target.value)}
                            autoFocus
                        ></textarea>

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowDiscardModal(false)} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white">Cancelar</button>
                            <button onClick={confirmDiscard} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-rose-900/20">
                                Confirmar Descarte
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <ArrowRight className="rotate-180" size={24} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            {candidate.nombre}
                            {candidate.assignedTo && (
                                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 uppercase">
                                    Resp: {candidate.assignedTo}
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-slate-400">{candidate.puesto}</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 md:items-center">
                    {/* SWITCH DE PESTAÑAS */}
                    <div className="bg-slate-900 p-1 rounded-lg border border-slate-800 flex self-start">
                        <button 
                            onClick={() => setActiveSubTab('gestion')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeSubTab === 'gestion' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Gestión
                        </button>
                        <button 
                            onClick={() => setActiveSubTab('history')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeSubTab === 'history' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Cronología
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowDiscardModal(true)} 
                                className="px-4 py-2 rounded-lg border border-rose-900/50 text-rose-400 hover:bg-rose-900/20 text-sm font-medium transition-colors">
                            Descartar
                        </button>
                        
                        {/* LÓGICA DE BOTÓN PRINCIPAL SEGÚN ETAPA */}
                        {candidate.stage === 'stage_1' ? (
                            <button onClick={handleApprove} 
                                    className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all shadow-lg active:scale-95">
                                Aprobar
                            </button>
                        ) : (
                            <button onClick={handleMoveToReport} 
                                    disabled={!isStage2Complete}
                                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 flex items-center gap-2 ${isStage2Complete ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'}`}>
                                {isStage2Complete ? <><FileJson size={16}/> Pasar a Informe</> : <><Lock size={16}/> Completar Checklist</>}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* --- CUERPO PRINCIPAL --- */}
            {activeSubTab === 'gestion' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
                    {/* COLUMNA IZQUIERDA (INTACTA) */}
                    <div className="lg:col-span-4 space-y-6">
                        <Card className="p-6 bg-slate-900 border-slate-800">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">IA Match</span>
                                <div className={`px-3 py-1 rounded-full border ${ (candidate.ia_score || 0) >= 70 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400' }`}>
                                    <span className="text-3xl font-bold">{candidate.ia_score || 0}</span>
                                    <span className="text-xs opacity-70">/100</span>
                                </div>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${ (candidate.ia_score || 0) >= 70 ? 'bg-emerald-500' : 'bg-rose-500' }`} style={{ width: `${candidate.ia_score || 5}%` }}></div>
                            </div>
                            {flags.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-slate-800">
                                    <p className="text-[10px] font-bold text-rose-500 uppercase mb-2 flex items-center gap-1"><AlertTriangle size={12}/> Alertas</p>
                                    <div className="flex flex-wrap gap-2">
                                        {flags.map((flag, i) => <span key={i} className="px-2 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold rounded uppercase">{flag}</span>)}
                                    </div>
                                </div>
                            )}
                        </Card>

                        <Card className="p-6 bg-slate-900 border-slate-800">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Material</h3>
                                <button onClick={() => setIsEditing(!isEditing)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                    {isEditing ? '✕ Cancelar' : '✏️ Editar Links'}
                                </button>
                            </div>
                            <div className="space-y-3">
                                {isEditing && (
                                    <div className="p-3 bg-slate-950 rounded-lg border border-blue-500/30 mb-2 animate-in fade-in space-y-3">
                                        <div>
                                            <label className="text-[10px] text-blue-400 font-bold uppercase mb-1 block">Link CV (PDF):</label>
                                            <input type="text" value={newCvLink} onChange={(e) => setNewCvLink(e.target.value)} placeholder="https://..." className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-purple-400 font-bold uppercase mb-1 block">Link Video:</label>
                                            <input type="text" value={newVideoLink} onChange={(e) => setNewVideoLink(e.target.value)} placeholder="https://..." className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-purple-500" />
                                        </div>
                                        <button 
                                            onClick={saveLinks} 
                                            disabled={isAnalyzingVideo}
                                            className="w-full bg-emerald-600 text-white py-1.5 rounded text-xs font-bold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isAnalyzingVideo ? (
                                                <Loader2 size={14} className="animate-spin"/>
                                            ) : (
                                                <>💾 GUARDAR CAMBIOS</>
                                            )}
                                        </button>
                                    </div>
                                )}
                                <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950 hover:border-blue-500/50 hover:bg-slate-900 transition-all group">
                                    <a href={candidate.cv_url} target="_blank" className="flex items-center gap-4 flex-1 cursor-pointer">
                                        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><FileText size={20}/></div>
                                        <div className="flex-1"><h4 className="text-sm font-bold text-white">Curriculum Vitae</h4><p className="text-xs text-blue-500 group-hover:underline">{candidate.cv_url && candidate.cv_url.length > 5 ? "Ver Documento" : "Link no disponible"}</p></div>
                                    </a>
                                </div>
                                <div className={`flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950 transition-all group ${!candidate.video_url || !candidate.video_url.startsWith('http') ? 'opacity-50' : ''} ${isAnalyzingVideo ? 'border-purple-500/50 bg-purple-500/5' : ''}`}>
                                    <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
                                        {isAnalyzingVideo ? <Loader2 size={20} className="animate-spin"/> : <Video size={20}/>}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                            Video Presentación
                                            {isAnalyzingVideo && (
                                                <span className="text-[10px] bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30 animate-pulse">
                                                    Analizando...
                                                </span>
                                            )}
                                        </h4>
                                        <p className="text-xs text-purple-400 group-hover:underline">
                                            {isAnalyzingVideo ? 'Procesando video con IA...' :
                                             !candidate.video_url ? 'No disponible' : 
                                             candidate.video_url.startsWith('http') ? (
                                                 <a href={candidate.video_url} target="_blank" className="hover:underline">Abrir Link Externo</a>
                                             ) : 
                                             candidate.video_tipo === 'archivo' ? 'Video subido (ver en Zoho)' : 
                                             'Link no válido'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* COLUMNA DERECHA */}
                    <div className="lg:col-span-8 space-y-6">
                        <Card className="p-8 bg-slate-900 border-slate-800 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 relative z-10"><Sparkles className="text-blue-400" size={20} /> Análisis del Perfil</h2>
                            <div className="bg-slate-950/50 rounded-xl p-6 border border-slate-800 mb-6 relative z-10">
                                <p className="text-sm text-slate-300 leading-relaxed">{candidate.ia_motivos || candidate.motivo || "Análisis pendiente..."}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">Datos Clave</h3>
                                    <ul className="space-y-3">
                                        <li className="flex justify-between text-xs"><span className="text-slate-400">Salario:</span><span className={candidate.respuestas_filtro?.salario === 'Sí' ? "text-emerald-400" : "text-white"}>{candidate.respuestas_filtro?.salario || "N/A"}</span></li>
                                        <li className="flex justify-between text-xs"><span className="text-slate-400">Monitoreo:</span><span className={candidate.respuestas_filtro?.monitoreo === 'Sí' ? "text-emerald-400" : "text-white"}>{candidate.respuestas_filtro?.monitoreo || "N/A"}</span></li>
                                        <li className="flex justify-between text-xs"><span className="text-slate-400">Disponibilidad:</span><span className="text-white">{candidate.respuestas_filtro?.disponibilidad || "N/A"}</span></li>
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">Skills</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {hardSkills.map((skill, i) => <span key={i} className="px-3 py-1 bg-slate-800 text-slate-300 text-[11px] rounded border border-slate-700">{skill}</span>)}
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* 🔥 SECCIÓN DE RESEÑAS (CV Y VIDEO) 🔥 */}
                        {(candidate.reseña_cv || candidate.reseña_video || (candidate.transcripcion_entrevista && candidate.ia_motivos)) && (
                            <Card className="p-6 bg-slate-900 border-slate-800">
                                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <FileText className="text-blue-500" size={18} /> Reseñas Generadas por IA
                                </h2>
                                <div className="space-y-4">
                                    {candidate.reseña_cv && (
                                        <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                            <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <FileText size={14} /> Reseña del CV
                                            </h3>
                                            <p className="text-sm text-slate-300 leading-relaxed">{candidate.reseña_cv}</p>
                                        </div>
                                    )}
                                    {candidate.reseña_video && (
                                        <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                            <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <Video size={14} /> Reseña del Video de Presentación
                                            </h3>
                                            <p className="text-sm text-slate-300 leading-relaxed">{candidate.reseña_video}</p>
                                        </div>
                                    )}
                                    {candidate.transcripcion_entrevista && candidate.ia_motivos && (
                                        <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                            <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <MessageSquare size={14} /> Análisis de la Transcripción
                                            </h3>
                                            <p className="text-sm text-slate-300 leading-relaxed">{candidate.ia_motivos}</p>
                                        </div>
                                    )}
                                    {candidate.video_error && (
                                        <div className="bg-amber-900/20 rounded-lg p-4 border border-amber-500/30">
                                            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">
                                                ⚠️ Alerta de Video
                                            </h3>
                                            <p className="text-sm text-amber-300">{candidate.video_error}</p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        )}

                        {/* 🔥 SECCIÓN DE GESTIÓN (SOLO SI ESTÁ EN ETAPA 2) 🔥 */}
                        {candidate.stage === 'stage_2' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                                
                                {/* 1. AGENDAR Y TRANSCRIPCIÓN */}
                                <div className="bg-slate-950 border border-blue-900/30 rounded-xl p-6 shadow-xl">
                                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Calendar size={16}/> 1. Gestión de Entrevista
                                    </h3>
                                    
{/* BLOQUE NUEVO: BOTONES SEPARADOS (REGISTRAR + ENVIAR) */}
<div className="grid grid-cols-1 gap-4 mb-6">
   <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Link de Meet / Zoom</label>
   <div className="flex gap-2 w-full">
       {/* INPUT */}
       <div className="relative flex-1">
           <Video className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16}/>
           <input
               type="text"
               placeholder="Pegar link de reunión aquí..."
               className={`w-full pl-10 pr-4 py-2.5 bg-slate-900 border rounded-lg text-sm text-white focus:outline-none transition-all placeholder-slate-600 ${candidate.meet_link ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-700 focus:border-blue-500'}`}
               value={candidate.meet_link || meetLink}
               onChange={(e) => setMeetLink(e.target.value)}
               onBlur={saveMeetLink}
           />
       </div>
      
       {/* BOTÓN 1: REGISTRAR (DISKETTE) */}
       <button
           onClick={saveMeetLink}
           className={`px-4 rounded-lg border transition-all flex items-center justify-center gap-2 font-bold text-xs ${candidate.meet_link ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'}`}
           title="Guardar link en la base de datos"
       >
           {candidate.meet_link ? <><CheckCircle size={14}/> GUARDADO</> : <><Save size={14}/> REGISTRAR</>}
       </button>


       {/* BOTÓN 2: ENVIAR MAIL (SOBRE) */}
       <button
           onClick={handleOpenMail}
           disabled={!candidate.meet_link && !meetLink}
           className={`px-4 rounded-lg border transition-all flex items-center justify-center gap-2 font-bold text-xs ${!candidate.meet_link && !meetLink ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-lg'}`}
           title="Abrir correo con invitación"
       >
           <Mail size={14}/> ENVIAR MAIL
       </button>
   </div>
</div>


                                   {/* BLOQUE MEJORADO: TRANSCRIPCIÓN + IA */}
                                   <div className="border-t border-slate-800 pt-4 mt-4">
                                       <div className="flex justify-between items-end mb-2">
                                           <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-2">
                                               <MessageSquare size={12}/> Transcripción / Notas
                                           </label>
                                           
                                           {/* BOTÓN MÁGICO DE ANÁLISIS - Solo mostrar si NO está analizada */}
                                           {!candidate.transcripcion_entrevista && (
                                               <button
                                                   onClick={handleAnalyzeInterview}
                                                   disabled={isAnalyzing || !transcript}
                                                   className="text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded border border-purple-400 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20"
                                               >
                                                   {isAnalyzing ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                                                   {isAnalyzing ? "Analizando..." : "ANALIZAR ENTREVISTA"}
                                               </button>
                                           )}
                                       </div>
                                       
                                       {/* Si ya está analizada, mostrar mensaje fijo */}
                                       {candidate.transcripcion_entrevista ? (
                                           <div className="w-full h-32 bg-emerald-900/20 border border-emerald-500/50 rounded-lg p-4 flex items-center justify-center">
                                               <div className="text-center">
                                                   <div className="text-emerald-400 text-sm font-bold mb-1 flex items-center justify-center gap-2">
                                                       <CheckCircle size={16}/> TRANSCRIPCIÓN ANALIZADA
                                                   </div>
                                                   <p className="text-xs text-emerald-300/70">La transcripción fue procesada y el score fue actualizado.</p>
                                               </div>
                                           </div>
                                       ) : (
                                           <textarea
                                               className="w-full h-32 bg-slate-900 border border-slate-800 rounded-lg p-4 text-sm text-slate-300 focus:border-purple-500 outline-none resize-none placeholder-slate-600 leading-relaxed custom-scrollbar"
                                               placeholder="Pega aquí la transcripción o toma notas. Luego presiona 'Analizar' para actualizar el Score."
                                               value={transcript}
                                               onChange={(e) => setTranscript(e.target.value)}
                                               onBlur={saveTranscript}
                                           ></textarea>
                                       )}
                                   </div>
                               </div>


                               {/* 2. CHECKLIST DE AVANCE (VALIDADOR) */}
                               {/* 2. SEMÁFORO FORMULARIO 2 + DECISIÓN */}
                               <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
                                   {/* Decoración lateral según estado */}
                                   <div className={`absolute top-0 left-0 w-1 h-full transition-colors duration-500 ${
                                       form2Status === 'received' ? 'bg-emerald-500' :
                                       form2Status === 'sent' ? 'bg-amber-500' : 'bg-slate-700'
                                   }`}></div>


                                   <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-6 flex items-center gap-2">
                                       <FileJson size={16}/> 2. Formulario de Validación
                                   </h3>
                                  
                                   <div className="space-y-8">
                                       {/* SEMÁFORO DE ESTADOS */}
                                       <div>
                                           <label className="text-[10px] text-slate-500 font-bold uppercase mb-3 block">Estado del Envío</label>
                                           <div className="grid grid-cols-3 gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                                              
                                               {/* 1. PENDIENTE (GRIS) - SOLO VISUAL */}
<div
   className={`py-2 px-3 rounded-md text-[10px] font-bold uppercase text-center ${
       form2Status === 'pending'
       ? 'bg-slate-700 text-white shadow-sm'
       : 'text-slate-600'
   }`}
>
   ⚪ Pendiente
</div>


                                               {/* 2. ENVIADO (AMARILLO) - CON ACCIÓN DE MAIL */}
                                               <button
                                                   onClick={handleSendForm2}
                                                   className={`py-2 rounded-md text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                                                       form2Status === 'sent'
                                                       ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-md'
                                                       : 'text-slate-500 hover:text-amber-400'
                                                   }`}
                                               >
                                                   {form2Status === 'sent' ? <Mail size={12}/> : <Send size={12}/>}
                                                   {form2Status === 'sent' ? 'Enviado' : 'Enviar Mail'}
                                               </button>


                                               {/* 3. RECIBIDO (VERDE) */}
                                               {/* 3. RECIBIDO (VERDE) - MODO SOLO LECTURA 🔒 */}
<button
   disabled={true}
   className={`py-2 rounded-md text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 cursor-default ${
       form2Status === 'received'
       ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-md'
       : 'bg-slate-900 border-slate-800 text-slate-600 opacity-50'
   }`}
>
   {form2Status === 'received' ? <CheckCircle size={12}/> : <div className="w-3 h-3 rounded-full border border-slate-600"></div>}
   {form2Status === 'received' ? 'CONFIRMADO' : 'ESPERANDO RESPUESTA...'}
</button>
                                           </div>
                                           {form2Status === 'sent' && <p className="text-[9px] text-amber-500/70 mt-1 pl-1">* Esperando respuesta del candidato.</p>}
                                           {form2Status === 'received' && <p className="text-[9px] text-emerald-500/70 mt-1 pl-1">* Respuestas cargadas correctamente.</p>}
                                       </div>


                                       {/* DECISIÓN DEL RECLUTADOR (SOLO APARECE SI ESTÁ RECIBIDO O ENVIADO) */}
                                       <div className={`transition-all duration-500 ${form2Status === 'pending' ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                                           <label className="text-[10px] text-slate-500 font-bold uppercase mb-3 block">Decisión Final</label>
                                           <div className="grid grid-cols-2 gap-4">
                                               <button
                                                   onClick={() => updateChecklist('result', 'qualified')}
                                                   className={`py-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                                       finalResult === 'qualified'
                                                       ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/30 ring-1 ring-emerald-400'
                                                       : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-emerald-500/50 hover:text-emerald-400'
                                                   }`}
                                               >
                                                   <ThumbsUp size={16}/> Calificado
                                               </button>
                                               <button
                                                   onClick={() => updateChecklist('result', 'disqualified')}
                                                   className={`py-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                                       finalResult === 'disqualified'
                                                       ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/30 ring-1 ring-rose-400'
                                                       : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-rose-500/50 hover:text-rose-400'
                                                   }`}
                                               >
                                                   <ThumbsDown size={16}/> No Calificado
                                               </button>
                                           </div>
                                       </div>
                                   </div>
                               </div>
                           </div>
                       )}


                       <Card className="bg-slate-900 border-slate-800 flex flex-col overflow-hidden">
                           <div className="p-4 border-b border-slate-800 bg-slate-950/30"><h3 className="text-sm font-bold text-white">Tus Notas Personales</h3></div>
                           <textarea className="w-full h-32 bg-slate-900 p-4 text-slate-300 focus:outline-none placeholder-slate-600 resize-none text-sm" placeholder="Escribe aquí..." value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onBlur={() => onUpdate(candidate.id, { notes: noteInput })}></textarea>
                       </Card>
                   </div>
               </div>
           ) : (
               <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-3xl mx-auto mt-6">
                   <Card className="bg-slate-900 border-slate-800 p-8">
                       <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                           <History size={16}/> Historial de Movimientos
                       </h3>
                      
                       {!candidate.history || candidate.history.length === 0 ? (
                           <div className="text-center py-10 border-2 border-dashed border-slate-800 rounded-xl">
                               <p className="text-slate-500 text-sm">No hay movimientos registrados aún.</p>
                           </div>
                       ) : (
                           <div className="relative border-l-2 border-slate-800 ml-3 space-y-8 pl-8 py-2">
                               {candidate.history.map((h, idx) => (
                                   <div key={idx} className="relative group">
                                       <div className="absolute -left-[39px] top-1 w-5 h-5 rounded-full bg-slate-900 border-2 border-blue-500 z-10 group-hover:scale-125 transition-transform shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                       <div className="flex flex-col gap-1">
                                           <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                                               {h.date ? new Date(h.date).toLocaleString('es-AR') : 'Fecha desconocida'}
                                           </span>
                                           <h4 className="text-white font-bold text-sm">{h.event || 'Evento del sistema'}</h4>
                                           <p className="text-xs text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800 inline-block mt-1">
                                               {h.detail || 'Sin detalles adicionales.'}
                                           </p>
                                       </div>
                                   </div>
                               ))}
                           </div>
                       )}
                   </Card>
               </div>
           )}
           
           {/* Modal de Reseña del CV */}
           {showResenaCV && candidate.reseña_cv && (
               <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowResenaCV(false)}>
                   <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
                       <div className="flex items-center justify-between mb-4">
                           <h3 className="text-lg font-bold text-white flex items-center gap-2">
                               <FileText className="text-blue-500" size={18} /> Reseña del CV
                           </h3>
                           <button 
                               onClick={() => setShowResenaCV(false)} 
                               className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
                           >
                               ✕
                           </button>
                       </div>
                       <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800">
                           <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{candidate.reseña_cv}</p>
                       </div>
                   </div>
               </div>
           )}
       </div>
   );
}

// --- COMPONENTE LOGIN (PORTERÍA DE ACCESO) ---
const LoginView = ({ onLogin }) => {
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const team = [
        { name: "Gladymar", role: "Recursos Humanos" },
        { name: "Sandra", role: "Recursos Humanos" },
        { name: "Viviana", role: "Recursos Humanos" },
        { name: "Pilar", role: "Ventas / Closer" },
        { name: "Norma", role: "Control de Calidad" },
        { name: "Daniel (CEO)", role: "Dirección" },
        { name: "Admin", role: "Superusuario" }
    ];
    
    const handleLogin = async (userName) => {
        setIsAuthenticating(true);
        
        try {
            // Intentar autenticación con Firebase si está disponible
            if (window.firebaseAuth && window.firebaseGoogleProvider && window.firebaseSignInWithPopup) {
                try {
                    const result = await window.firebaseSignInWithPopup(window.firebaseAuth, window.firebaseGoogleProvider);
                    const token = await result.user.getIdToken();
                    
                    // Guardar token en localStorage
                    localStorage.setItem('firebase_token', token);
                    localStorage.setItem('firebase_token_expires', (Date.now() + 3600000).toString()); // 1 hora
                    
                    console.log('✅ Autenticación exitosa con Firebase');
                } catch (authError) {
                    console.warn('⚠️ Error en autenticación Firebase, continuando sin token:', authError);
                    // Continuar sin token si falla la autenticación
                }
            } else {
                console.warn('⚠️ Firebase Auth no disponible, continuando sin autenticación');
            }
        } catch (error) {
            console.error('❌ Error en proceso de login:', error);
        } finally {
            setIsAuthenticating(false);
            // Siempre llamar a onLogin con el nombre (mantiene compatibilidad)
            onLogin(userName);
        }
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>
            <div className="relative z-10 w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Global Talent</h1>
                    <p className="text-slate-400 text-sm italic">"Conectando talento, automáticamente"</p>
                </div>

                <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center mb-4">Seleccioná tu perfil de acceso</p>
                    {isAuthenticating && (
                        <div className="text-center py-2 mb-2">
                            <p className="text-xs text-blue-400">Autenticando con Google...</p>
                        </div>
                    )}
                    {team.map(user => (
                        <button 
                            key={user.name}
                            onClick={() => handleLogin(user.name)}
                            disabled={isAuthenticating}
                            className="w-full p-4 rounded-xl bg-slate-800 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 transition-all group flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-700 group-hover:bg-white/20 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                                    {user.name.charAt(0)}
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-slate-200 group-hover:text-white leading-none">{user.name}</p>
                                    <p className="text-[10px] text-slate-500 group-hover:text-blue-100 uppercase mt-1.5 font-medium tracking-wider">{user.role}</p>
                                </div>
                            </div>
                            <LucideIcon name="ChevronRight" size={16} className="text-slate-600 group-hover:text-white transition-transform group-hover:translate-x-1" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- APP CONTAINER ---
function App() {
    // 1. ESTADOS (HOOKS) - Siempre arriba de todo
    const [activeTab, setActiveTab] = useState('dashboard');
    const [currentReport, setCurrentReport] = useState(null);
    const [selectedCandidateId, setSelectedCandidateId] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [init, setInit] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [showManualModal, setShowManualModal] = useState(false); 

    const LOGO_URL = "/GLOBAL.png";

    // 2. FUNCIÓN DE CARGA
    const cargarDatos = async (forceRefresh = false) => {
        if (init && !forceRefresh) return;
        setLoading(true);
        try {
            const data = await api.candidates.list();
            setCandidates(data);
            setInit(true);
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
        } finally {
            setLoading(false);
        }
    };

    // 3. EFECTOS
    useEffect(() => { 
        if (currentUser) cargarDatos(); 
    }, [currentUser]);

    // 4. LA PORTERÍA (Ubicado después de los hooks para evitar crashes)
    if (!currentUser) {
        return <LoginView onLogin={(name) => setCurrentUser(name)} />;
    }

// 5. LÓGICA DE ACTUALIZACIÓN (CORREGIDA)
const handleUpdateCandidate = async (id, updates) => {
        // 1. Preparamos la copia base de los cambios
        let finalUpdates = { ...updates };
        
        // 2. Buscamos al candidato ACTUAL para ver su estado hoy
        const currentCandidate = candidates.find(c => c.id === id);

        // 3. Lógica de Negocio: Asignaciones automáticas
        if (updates.stage === 'stage_2') {
            finalUpdates.assignedTo = currentUser; 
            finalUpdates.status_interno = 'interview_pending';
        }

        if (updates.stage === 'trash' || updates.stage === 'stage_3') {
            setSelectedCandidateId(null);
        }

        // 4. LÓGICA DE "VISTO" (Aquí estaba el bug)
        // Calculamos esto AHORA, fuera del setCandidates, para enviarlo bien a la API
        if (currentCandidate && activeTab === 'stage_1' && currentCandidate.status_interno === 'new' && !updates.stage) {
            finalUpdates.status_interno = 'viewed';
            finalUpdates.usuario_accion = currentUser; // 🔥 Identificar quién lo visualizó
        }

        // 5. Actualizamos la PANTALLA (Frontend)
        setCandidates(prev => prev.map(c => {
            if (c.id === id) {
                return { ...c, ...finalUpdates };
            }
            return c;
        }));

        // 6. Actualizamos la BASE DE DATOS (Backend)
        // Ahora finalUpdates lleva el dato 'viewed' correcto
        await api.candidates.update(id, finalUpdates);
    };

    const handleSelectCandidate = (id) => {
        setSelectedCandidateId(id);
        handleUpdateCandidate(id, {});
    };

    // 6. RENDERIZADO DE CONTENIDO (Única declaración)
    const renderContent = () => {
        if (currentReport) {
            return <ProfessionalReport data={currentReport} onBack={() => setCurrentReport(null)} />;
        }

        if (selectedCandidateId) {
            const cand = candidates.find(c => c.id === selectedCandidateId);
            if (!cand) return null;
            return (
                <CandidateDetail 
                    key={cand.id} 
                    candidate={cand} 
                    onBack={() => setSelectedCandidateId(null)} 
                    onUpdate={handleUpdateCandidate} 
                    loading={loading}
                    currentUser={currentUser} 
                />
            );
        }

        switch (activeTab) {
            case 'dashboard': return <DashboardView candidates={candidates} onNavigate={setActiveTab} />;
            case 'stage_1':   return <ExploreView candidates={candidates} onSelect={handleSelectCandidate} onUpdate={handleUpdateCandidate} loading={loading} onAddClick={() => setShowManualModal(true)} />;
            case 'stage_2':   return <ManageView candidates={candidates} onSelect={handleSelectCandidate} currentUser={currentUser} />;
            case 'stage_3':   return <ReportView candidates={candidates} onUpdate={handleUpdateCandidate} setCurrentReport={setCurrentReport} />;
            case 'search':    return <SearchView candidates={candidates} onSelect={handleSelectCandidate} />;
            case 'trash':     return <TrashView candidates={candidates} onUpdate={handleUpdateCandidate} />;
            default:          return <DashboardView candidates={candidates} onNavigate={setActiveTab} />;
        }
    };

    const menuItems = [
        { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
        { type: 'divider', label: 'PIPELINE' },
        { id: 'stage_1', label: '1. Explorar', icon: UserPlus, sub: 'Nuevos Ingresos' },
        { id: 'stage_2', label: '2. Gestión', icon: Users, sub: 'En Entrevista' },
        { id: 'stage_3', label: '3. Generar Informe', icon: FileJson, sub: 'Listos para Asignar' },
        { type: 'divider', label: 'SISTEMA' },
        { id: 'search', label: 'Búsqueda', icon: Search },
        { id: 'trash', label: 'Papelera', icon: Trash2 },
    ];

   // 7. ESTRUCTURA PRINCIPAL (ACTUALIZADA CON MODAL)
   return (
        <>
            <div className="flex h-screen bg-slate-950 font-sans text-slate-200 selection:bg-blue-500/30 overflow-hidden">
                <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-20">
                    <div className="h-24 flex items-center justify-center px-6 border-b border-slate-800 bg-slate-900">
                        <img src={LOGO_URL} alt="Logo" className="max-h-20 w-auto object-contain transition-all hover:scale-105" />
                    </div>
                    <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto custom-scrollbar">
                        {menuItems.map((item, idx) => {
                            if (item.type === 'divider') return <div key={idx} className="px-3 pt-6 pb-2 text-[10px] font-bold text-slate-600 tracking-widest uppercase">{item.label}</div>;
                            const isActive = activeTab === item.id;
                            return (
                                <button key={item.id} onClick={() => { setActiveTab(item.id); setSelectedCandidateId(null); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group relative ${isActive ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}`}>
                                    <item.icon size={18} className={isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'} />
                                    <div className="flex flex-col items-start text-left"><span className="font-medium leading-none">{item.label}</span>{item.sub && isActive && <span className="text-[10px] opacity-70 font-normal mt-1">{item.sub}</span>}</div>
                                    {isActive && <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="p-4 border-t border-slate-800">
                        <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-slate-800 transition-colors group border border-transparent hover:border-slate-700">
                            <Avatar name={currentUser} />
                            <div className="flex-col flex items-start overflow-hidden">
                                <span className="text-xs font-bold text-slate-200 group-hover:text-white">{currentUser}</span>
                                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> Online
                                </span>
                            </div>
                            <Settings size={14} className="ml-auto text-slate-600 group-hover:text-slate-400 transition-colors"/>
                        </button>
                    </div>
                </aside>
                <main className="flex-1 overflow-auto p-6 relative bg-slate-950">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none mix-blend-overlay"></div>
                    <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none"></div>
                    <div className="relative z-10 h-full">{renderContent()}</div>
                </main>
            </div>

            {/* MODAL FÍSICO (Controlado por el estado showManualModal) */}
            <ManualUploadModal 
                isOpen={showManualModal} 
                onClose={() => setShowManualModal(false)} 
                onUploadSuccess={() => cargarDatos(true)}
                currentUser={currentUser}
            />
        </>
    );
}

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);