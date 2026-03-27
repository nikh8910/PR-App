import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';

/**
 * Reusable page header with consistent Back + Home navigation.
 * 
 * @param {string} title - Main title text
 * @param {string} [subtitle] - Optional subtitle below title
 * @param {React.ReactNode} [children] - Optional extra content rendered below the nav row (e.g. search bar)
 */
const PageHeader = ({ title, subtitle, children }) => {
    const navigate = useNavigate();

    return (
        <header
            className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
        >
            <div className="flex justify-between items-start mb-4">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Back"
                >
                    <ArrowLeft size={22} className="text-white" />
                </button>
                <button
                    onClick={() => navigate('/menu', { replace: true })}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Home"
                >
                    <Home size={22} className="text-white" />
                </button>
            </div>

            <div className="flex flex-col items-center justify-center mb-1 relative">
                <h1 className="text-xl font-bold text-white mb-0.5 tracking-wide">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-blue-200 text-xs font-medium uppercase tracking-wider">
                        {subtitle}
                    </p>
                )}
            </div>

            {children}
        </header>
    );
};

export default PageHeader;
