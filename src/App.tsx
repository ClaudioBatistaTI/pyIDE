import React, { useState, useEffect, useRef } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';
import { Play, Save, Terminal, AlertCircle, Loader2, Download, Trash2, Eye, EyeOff } from 'lucide-react';

// Declare pyodide global
declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<any>;
  }
}

type TerminalLine = {
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
};

export default function App() {
  const [code, setCode] = useState<string>('# Escreva seu código Python aqui\nprint("Olá, Mundo!")\n');
  const [terminalHistory, setTerminalHistory] = useState<TerminalLine[]>([]);
  const [terminalInput, setTerminalInput] = useState<string>('');
  const [showPrompt, setShowPrompt] = useState<boolean>(true);
  const [isPyodideLoading, setIsPyodideLoading] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);
  const pyodideRef = useRef<any>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initPyodide = async () => {
      try {
        pyodideRef.current = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
        });
        setIsPyodideLoading(false);
      } catch (err) {
        console.error('Failed to load Pyodide:', err);
        setInitError('Falha ao carregar o interpretador Python. Verifique sua conexão.');
        setIsPyodideLoading(false);
      }
    };

    if (window.loadPyodide) {
      initPyodide();
    } else {
      // Wait for script to load
      const checkPyodide = setInterval(() => {
        if (window.loadPyodide) {
          clearInterval(checkPyodide);
          initPyodide();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkPyodide);
        if (!pyodideRef.current) {
          setInitError('Tempo limite excedido ao carregar o interpretador Python.');
          setIsPyodideLoading(false);
        }
      }, 10000);
    }
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalHistory]);

  // Bloquear atalhos de nova aba e saída da página
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tenta bloquear Ctrl+T (Nova Aba) e Ctrl+N (Nova Janela)
      if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'n')) {
        e.preventDefault();
        alert('⚠️ Foco nos estudos! Tentar abrir novas abas foi bloqueado para manter sua concentração na programação.');
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Mostra um aviso se o usuário tentar fechar a aba ou recarregar a página
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const runCode = async () => {
    if (!pyodideRef.current) return;
    
    setIsRunning(true);
    setTerminalHistory([{ type: 'system', content: '--- Executando meu_script.py ---' }]);

    try {
      // Redirect stdout
      pyodideRef.current.setStdout({
        batched: (msg: string) => {
          setTerminalHistory(prev => [...prev, { type: 'output', content: msg }]);
        }
      });
      
      // Redirect stderr
      pyodideRef.current.setStderr({
        batched: (msg: string) => {
          setTerminalHistory(prev => [...prev, { type: 'error', content: msg }]);
        }
      });

      await pyodideRef.current.runPythonAsync(code);
      
    } catch (err: any) {
      setTerminalHistory(prev => [...prev, { type: 'error', content: err.message || 'Ocorreu um erro ao executar o código.' }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !pyodideRef.current || isRunning) return;

    const input = terminalInput;
    setTerminalInput('');
    setTerminalHistory(prev => [...prev, { type: 'input', content: input }]);
    setIsRunning(true);

    try {
      pyodideRef.current.setStdout({
        batched: (msg: string) => {
          setTerminalHistory(prev => [...prev, { type: 'output', content: msg }]);
        }
      });
      
      pyodideRef.current.setStderr({
        batched: (msg: string) => {
          setTerminalHistory(prev => [...prev, { type: 'error', content: msg }]);
        }
      });

      const result = await pyodideRef.current.runPythonAsync(input);
      
      if (result !== undefined) {
        setTerminalHistory(prev => [...prev, { type: 'output', content: String(result) }]);
      }
    } catch (err: any) {
      setTerminalHistory(prev => [...prev, { type: 'error', content: err.message }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meu_script.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    alert('⚠️ Colar código não é permitido!\n\nPara aprender de verdade, você deve digitar o código. A prática leva à perfeição!');
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#252526] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
            <Terminal size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Python Learning IDE</h1>
            <p className="text-xs text-gray-400">Aprenda digitando, não copiando.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-300 bg-[#333] hover:bg-[#444] rounded-md transition-colors"
          >
            <Download size={16} />
            Salvar .py
          </button>
          
          <button
            onClick={runCode}
            disabled={isPyodideLoading || isRunning}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white rounded-md transition-colors ${
              isPyodideLoading || isRunning 
                ? 'bg-green-700/50 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            {isRunning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            {isRunning ? 'Executando...' : 'Executar'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        {/* Editor Pane */}
        <div className="flex-1 flex flex-col border-r border-[#333]">
          <div className="px-4 py-2 bg-[#2d2d2d] text-xs font-medium text-gray-400 flex justify-between items-center">
            <span>meu_script.py</span>
            <span className="text-yellow-500 flex items-center gap-1">
              <AlertCircle size={12} />
              Colar desativado
            </span>
          </div>
          <div className="flex-1 overflow-auto bg-[#1e1e1e] flex">
            <div 
              className="w-12 flex-shrink-0 bg-[#1e1e1e] border-r border-[#333] text-[#858585] text-right pr-3 select-none sticky left-0 z-10"
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                paddingTop: 16,
                paddingBottom: 16,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {code.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <div 
              className="flex-1 relative"
              onPasteCapture={handlePaste}
            >
              <Editor
                value={code}
                onValueChange={setCode}
                highlight={code => Prism.highlight(code, Prism.languages.python, 'python')}
                padding={16}
                style={{
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  fontSize: 14,
                  lineHeight: 1.5,
                  minHeight: '100%',
                  outline: 'none',
                  whiteSpace: 'pre',
                }}
                textareaClassName="focus:outline-none"
                className="language-python min-h-full"
              />
            </div>
          </div>
        </div>

        {/* Terminal Pane */}
        <div className="w-1/3 flex flex-col bg-[#1e1e1e]">
          <div className="px-4 py-2 bg-[#2d2d2d] text-xs font-medium text-gray-400 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Terminal size={14} />
              Saída do Terminal
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowPrompt(!showPrompt)}
                className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors"
                title={showPrompt ? "Ocultar Prompt" : "Mostrar Prompt"}
              >
                {showPrompt ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPrompt ? "Ocultar" : "Mostrar"}
              </button>
              <button 
                onClick={() => setTerminalHistory([])}
                className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors"
                title="Limpar Terminal"
              >
                <Trash2 size={14} />
                Limpar
              </button>
            </div>
          </div>
          
          <div className="flex-1 p-4 overflow-auto font-mono text-sm" ref={outputRef}>
            {isPyodideLoading ? (
              <div className="flex items-center gap-2 text-blue-400">
                <Loader2 size={16} className="animate-spin" />
                Carregando interpretador Python...
              </div>
            ) : initError ? (
              <div className="text-red-400 whitespace-pre-wrap">
                {initError}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {terminalHistory.length === 0 && (
                  <div className="text-gray-500 italic mb-2">
                    A saída do seu programa aparecerá aqui. Você também pode digitar comandos abaixo.
                  </div>
                )}
                {terminalHistory.map((line, i) => (
                  <div 
                    key={i} 
                    className={`whitespace-pre-wrap ${
                      line.type === 'error' ? 'text-red-400' : 
                      line.type === 'system' ? 'text-blue-400 italic' : 
                      line.type === 'input' ? 'text-green-400' : 
                      'text-gray-300'
                    }`}
                  >
                    {line.type === 'input' ? `>>> ${line.content}` : line.content}
                  </div>
                ))}
              </div>
            )}
            
            {!isPyodideLoading && !initError && showPrompt && (
              <form onSubmit={handleTerminalSubmit} className="mt-2 flex items-start">
                <span className="text-green-400 mr-2 mt-0.5">{">>>"}</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  disabled={isRunning}
                  className="flex-1 bg-transparent outline-none text-gray-300 font-mono"
                  placeholder="Digite um comando Python..."
                  autoComplete="off"
                  spellCheck="false"
                />
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
