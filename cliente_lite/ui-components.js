const { useState, useEffect, useMemo } = React;

        // --- ADAPTADOR DE ICONOS LUCIDE (VERSIÓN FINAL ROBUSTA) ---
const LucideIcon = ({ name, size = 24, className, ...props }) => {
    // 1. Intentamos buscar el icono tal cual viene (Ej: "UserPlus")
    let iconData = lucide.icons[name];

    // 2. Si no existe, probamos convertirlo a kebab-case (Ej: "user-plus")
    if (!iconData) {
        const iconNameKebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        iconData = lucide.icons[iconNameKebab];
    }

    // 3. Si sigue sin existir, no renderizamos nada (evita errores)
    if (!iconData) {
        console.warn(`Icono no encontrado: ${name}`);
        return null;
    }

    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`lucide lucide-${name.toLowerCase()} ${className || ''}`}
        >
            {iconData.map((child, index) => {
                const [tagName, attrs] = child;
                return React.createElement(tagName, { ...attrs, key: index });
            })}
        </svg>
    );
};

 // Lista de iconos requeridos (Agregué 'Sparkles' para el análisis)
 const iconList = [
    'LayoutDashboard', 'Users', 'FileText', 'HelpCircle', 'Settings', 
    'Search', 'CheckCircle', 'XCircle', 'X', 'ChevronRight', 'Filter', 
    'Clock', 'Calendar', 'FileJson', 'RefreshCw', 'Send', 'UserPlus', 
    'Video', 'ExternalLink', 'AlertTriangle', 'AlertCircle', 'MessageSquare', 'ArrowRight', 'ArrowLeft',
    'Briefcase', 'Lock', 'UserCheck', 'Loader2', 'Trash2', 'Undo2', 'MoreVertical',
    'CheckSquare', 'Printer', 'Eye', 'EyeOff', 'Mail', 'Activity', 'Server', 'Database', 'Globe',
    'ThumbsUp', 'ThumbsDown', 'Link', 'Download', 'Share2', 'History',
    'BarChart2', 'List', 'Sparkles', 'Save', 'Wrench', 'LogOut', 'ChevronDown', 'CloudDownload'
];

const Icons = {};
iconList.forEach(name => {
    Icons[name] = (props) => <LucideIcon name={name} {...props} />;
});

Icons.LinkIcon = Icons.Link;

const { 
    LayoutDashboard, Users, FileText, HelpCircle, Settings, 
    Search, CheckCircle, XCircle, ChevronRight, Filter, 
    Clock, Calendar, FileJson, RefreshCw, Send, UserPlus, 
    Video, ExternalLink, AlertTriangle, MessageSquare, ArrowRight, ArrowLeft,
    Briefcase, Lock, UserCheck, Loader2, Trash2, Undo2, MoreVertical,
    CheckSquare, Printer, Eye, Mail, Activity, Server, Database, Globe,
    ThumbsUp, ThumbsDown, LinkIcon, Download, Share2, History,
    BarChart2, List, Sparkles, Wrench, LogOut, ChevronDown, CloudDownload
} = Icons;

const Badge = ({ children, type = 'neutral', className = '' }) => {
    const styles = {
        neutral: "bg-slate-800 text-slate-400 border-slate-700",
        success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
        danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    };
    if (type === 'green') type = 'success';
    if (type === 'slate') type = 'neutral';
    
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${styles[type] || styles.neutral} ${className}`}>
        {children}
        </span>
    );
    
    };

    const Card = ({ children, className = "", onClick }) => (
    <div 
        onClick={onClick}
        className={`bg-slate-900 border border-slate-800 rounded-xl transition-all relative overflow-hidden ${onClick ? 'cursor-pointer hover:border-slate-600 hover:shadow-md' : ''} ${className}`}
    >
        {children}
    </div>
    );

    const SkeletonCard = () => (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 min-h-[180px] flex flex-col justify-between">
            <div className="flex justify-between mb-3">
                <div className="h-3 w-24 skeleton"></div>
                <div className="h-5 w-8 skeleton"></div>
            </div>
            <div className="mb-6">
                <div className="h-6 w-3/4 skeleton mb-2"></div>
                <div className="h-4 w-1/4 skeleton"></div>
            </div>
            <div className="mt-auto border-t border-slate-800 pt-3">
                <div className="h-3 w-20 skeleton"></div>
            </div>
        </div>
    );

    const Button = ({ children, variant = "primary", icon: Icon, onClick, className = "", disabled = false, size = "md", ariaLabel }) => {
        const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm", icon: "p-2" };
        const baseStyle = `flex items-center justify-center gap-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]}`;
        const variants = {
            primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 border border-blue-500/50",
            secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600",
            ghost: "text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent",
            success: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 border border-emerald-500/50",
            danger: "bg-rose-900/20 text-rose-400 hover:bg-rose-900/40 border border-rose-900/50"
        };
    
        return (
            <button 
                onClick={(e) => { e.stopPropagation(); onClick && onClick(e); }} 
                disabled={disabled} 
                className={`${baseStyle} ${variants[variant]} ${className}`}
                aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)} // Etiqueta para lectores de pantalla
                role="button"
            >
                {Icon && (disabled ? <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin"/> : <Icon size={size === 'sm' ? 14 : 16} />)}
                {children}
            </button>
        );
    };

    const Avatar = ({ name, url, size = "md" }) => {
        const dims = size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
        return (
            <div className={`${dims} rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center font-bold text-white border border-slate-500/50 shrink-0 overflow-hidden shadow-sm`}>
                {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : (name ? name.charAt(0) : '?')}
            </div>
        );
    };

    // --- COMPONENTE GRAFICO DE EMBUDO HORIZONTAL ---
    const HorizontalFunnel = ({ stats }) => {
        const maxVal = Math.max(stats.new, stats.interview, stats.ready) || 1;
        
        // Alerta de nuevos (Si hay status 'new' > 0)
        const newAlert = stats.newUnseen > 0;

        const steps = [
            { id: 'stage_1', label: 'Explorar', count: stats.new, color: 'bg-blue-600', width: 'w-full' },
            { id: 'stage_2', label: 'Gestión', count: stats.interview, color: 'bg-purple-600', width: 'w-2/3' },
            { id: 'stage_3', label: 'Informes', count: stats.ready, color: 'bg-emerald-600', width: 'w-1/3' },
        ];

        return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
                <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
                    <BarChart2 size={16}/> Flujo de Conversión Actual
                </h3>
                <div className="space-y-4">
                    {steps.map((step) => (
                        <div key={step.id} className="relative">
                            <div className="flex justify-between text-xs mb-1 font-medium">
                                <span className="text-white flex items-center gap-2">
                                    {step.label}
                                    {step.id === 'stage_1' && newAlert && (
                                        <span className="flex items-center gap-1 text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">
                                            +{stats.newUnseen} Nuevos
                                        </span>
                                    )}
                                </span>
                                <span className="text-slate-400">{step.count} Candidatos</span>
                            </div>
                            <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
                                <div 
                                    className={`h-full rounded-full ${step.color} shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-all duration-1000`} 
                                    style={{ width: `${(step.count / (stats.total || 1)) * 100}%`, minWidth: '5%' }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // --- HACER COMPONENTES GLOBALES PARA OTROS SCRIPTS ---
window.LucideIcon = LucideIcon;
window.Badge = Badge;
window.Card = Card;
window.SkeletonCard = SkeletonCard;
window.Button = Button;
window.Avatar = Avatar;
window.HorizontalFunnel = HorizontalFunnel;
// Exportamos todos los iconos desestructurados
Object.keys(Icons).forEach(iconName => {
    window[iconName] = Icons[iconName];
});

