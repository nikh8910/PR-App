const fs = require('fs');

const file = 'c:/Users/nikh8/PR/pr-app/src/pages/outbound/ConfirmPicking.jsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

const newBlock = `    if (!task) {
        return (
            <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-start mb-4">
                    <button onClick={() => setShowCancelModal(true)} className="p-2 rounded-full bg-white/10 text-white" title="Back">
                        <ArrowLeft size={22} />
                    </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Error
                        </h1>
                    </div>

                    <button onClick={() => navigate('/menu')} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                        <Home size={20} className="text-white" />
                    </button>
                </div>
            </header>
                <div className="p-6 text-center text-red-500 mt-10">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-sm text-red-700 max-w-xs mx-auto">{error || "No task found matching this ID."}</p>
                </div>
            </div>
        );
    }

    return (`.split('\n');

// Replace lines 250 to 474 (0-indexed 249 to 473).
const removed = lines.splice(249, 225, ...newBlock);
console.log("Removed " + removed.length + " lines, inserted " + newBlock.length + " lines.");

fs.writeFileSync(file, lines.join('\n'));
