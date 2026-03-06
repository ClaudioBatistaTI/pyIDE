import React, { useState, useEffect, useRef } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';
import { Play, Save, Terminal, AlertCircle, Loader2, Download, Upload, Trash2, Eye, EyeOff, Menu } from 'lucide-react';
import getCaretCoordinates from 'textarea-caret';
import { FileNode } from './types';
import FileExplorer from './components/FileExplorer';

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

const PYTHON_KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield',
  'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'bool',
  'type', 'dir', 'help', 'input', 'open', 'sum', 'max', 'min', 'abs', 'round', 'enumerate',
  'zip', 'map', 'filter', 'any', 'all'
];

export default function App() {
  const [files, setFiles] = useState<FileNode[]>(() => {
    const saved = localStorage.getItem('python_files');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved files', e);
      }
    }
    
    // Fallback to legacy code or default
    const legacyCode = localStorage.getItem('python_code');
    const defaultContent = legacyCode !== null ? legacyCode : '# Escreva seu código Python aqui\nnome = input("Qual é o seu nome? ")\nprint(f"Olá, {nome}!")\n';
    
    return [
      {
        id: 'main.py',
        name: 'main.py',
        type: 'file',
        parentId: null,
        content: defaultContent
      }
    ];
  });
  const [activeFileId, setActiveFileId] = useState<string | null>('main.py');
  const [showExplorer, setShowExplorer] = useState<boolean>(true);
  
  const activeFile = files.find(f => f.id === activeFileId);
  const code = activeFile?.content || '';

  const [terminalHistory, setTerminalHistory] = useState<TerminalLine[]>(() => {
    const saved = localStorage.getItem('python_terminal_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [terminalInput, setTerminalInput] = useState<string>('');
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('python_command_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [tempInput, setTempInput] = useState<string>('');
  const [showPrompt, setShowPrompt] = useState<boolean>(true);
  const [isPyodideLoading, setIsPyodideLoading] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [initError, setInitError] = useState<string | null>(null);
  
  // Input Modal state
  const [inputModal, setInputModal] = useState<{ isOpen: boolean; prompt: string }>({ isOpen: false, prompt: '' });
  const [inputValue, setInputValue] = useState('');
  
  // Execution refs
  const providedInputsRef = useRef<string[]>([]);
  const currentInputIndexRef = useRef<number>(0);
  const outputBufferRef = useRef<TerminalLine[]>([]);
  const currentRunTypeRef = useRef<'script' | 'terminal' | null>(null);
  const currentTerminalInputRef = useRef<string>('');
  const historyBeforeRunRef = useRef<TerminalLine[]>([]);
  
  // Autocomplete state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [caretCoords, setCaretCoords] = useState({ top: 0, left: 0, height: 0 });
  const [wordStart, setWordStart] = useState(0);

  const pyodideRef = useRef<any>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('python_files', JSON.stringify(files));
    // Also update legacy python_code for backward compatibility if main.py exists
    const mainFile = files.find(f => f.id === 'main.py');
    if (mainFile && mainFile.content) {
      localStorage.setItem('python_code', mainFile.content);
    }
  }, [files]);

  useEffect(() => {
    localStorage.setItem('python_terminal_history', JSON.stringify(terminalHistory));
  }, [terminalHistory]);

  useEffect(() => {
    localStorage.setItem('python_command_history', JSON.stringify(commandHistory));
  }, [commandHistory]);

  useEffect(() => {
    (window as any).getProvidedInput = () => {
      if (currentInputIndexRef.current < providedInputsRef.current.length) {
        return providedInputsRef.current[currentInputIndexRef.current++];
      }
      return null;
    };
    (window as any).setCurrentPrompt = (prompt: string) => {
      setInputModal({ isOpen: true, prompt });
    };
    (window as any).setIsWaitingForInput = (val: boolean) => {
      (window as any).isWaitingForInput = val;
    };

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

  const writeFilesToPyodide = () => {
    if (!pyodideRef.current) return;
    
    const getFullPath = (nodeId: string): string => {
      const node = files.find(f => f.id === nodeId);
      if (!node) return '';
      if (node.parentId === null) return node.name;
      return `${getFullPath(node.parentId)}/${node.name}`;
    };

    const getDepth = (nodeId: string): number => {
      const node = files.find(f => f.id === nodeId);
      if (!node || node.parentId === null) return 0;
      return 1 + getDepth(node.parentId);
    };

    const sortedFiles = [...files].sort((a, b) => getDepth(a.id) - getDepth(b.id));

    for (const file of sortedFiles) {
      const path = getFullPath(file.id);
      if (!path) continue;
      
      if (file.type === 'folder') {
        try {
          pyodideRef.current.FS.mkdir(path);
        } catch (e) {
          // Ignore if exists
        }
      } else {
        try {
          pyodideRef.current.FS.writeFile(path, file.content || '');
        } catch (e) {
          console.error(`Failed to write file ${path}`, e);
        }
      }
    }
  };

  const runCode = async (isContinuation: boolean | React.MouseEvent = false) => {
    if (!pyodideRef.current) return;
    
    const isCont = typeof isContinuation === 'boolean' ? isContinuation : false;
    
    if (!isCont) {
      setIsRunning(true);
      providedInputsRef.current = [];
      currentRunTypeRef.current = 'script';
      const initialHistory: TerminalLine[] = [{ type: 'system', content: `--- Executando ${activeFile?.name || 'meu_script.py'} ---` }];
      historyBeforeRunRef.current = initialHistory;
      setTerminalHistory(initialHistory);
    }
    
    currentInputIndexRef.current = 0;
    outputBufferRef.current = [];
    (window as any).isWaitingForInput = false;

    try {
      // Write files to Pyodide FS
      writeFilesToPyodide();

      // Redirect stdout
      pyodideRef.current.setStdout({
        batched: (msg: string) => {
          outputBufferRef.current.push({ type: 'output', content: msg });
        }
      });
      
      // Redirect stderr
      pyodideRef.current.setStderr({
        batched: (msg: string) => {
          outputBufferRef.current.push({ type: 'error', content: msg });
        }
      });

      pyodideRef.current.runPython(`
import builtins
import js

class InputRequiredException(BaseException):
    pass

def custom_input(prompt=""):
    val = js.getProvidedInput()
    if val is not None:
        print(prompt + str(val))
        return val
    else:
        js.setCurrentPrompt(prompt)
        js.setIsWaitingForInput(True)
        raise InputRequiredException("INPUT_REQUIRED")

builtins.input = custom_input
      `);

      await pyodideRef.current.runPythonAsync(code);
      
      setTerminalHistory([...historyBeforeRunRef.current, ...outputBufferRef.current]);
      setIsRunning(false);
      currentRunTypeRef.current = null;
      
    } catch (err: any) {
      if ((window as any).isWaitingForInput) {
        (window as any).isWaitingForInput = false;
        // Wait for modal
        setTerminalHistory([...historyBeforeRunRef.current, ...outputBufferRef.current]);
      } else {
        outputBufferRef.current.push({ type: 'error', content: err.message || 'Ocorreu um erro ao executar o código.' });
        setTerminalHistory([...historyBeforeRunRef.current, ...outputBufferRef.current]);
        setIsRunning(false);
        currentRunTypeRef.current = null;
      }
    }
  };

  const runTerminalCommand = async (input: string, isContinuation: boolean = false) => {
    if (!pyodideRef.current) return;

    const isCont = typeof isContinuation === 'boolean' ? isContinuation : false;

    if (!isCont) {
      setIsRunning(true);
      providedInputsRef.current = [];
      currentRunTypeRef.current = 'terminal';
      currentTerminalInputRef.current = input;
      historyBeforeRunRef.current = [...terminalHistory, { type: 'input', content: input }];
      setTerminalHistory(historyBeforeRunRef.current);
    }

    currentInputIndexRef.current = 0;
    outputBufferRef.current = [];
    (window as any).isWaitingForInput = false;

    try {
      // Write files to Pyodide FS
      writeFilesToPyodide();

      pyodideRef.current.setStdout({
        batched: (msg: string) => {
          outputBufferRef.current.push({ type: 'output', content: msg });
        }
      });
      
      pyodideRef.current.setStderr({
        batched: (msg: string) => {
          outputBufferRef.current.push({ type: 'error', content: msg });
        }
      });

      pyodideRef.current.runPython(`
import builtins
import js

class InputRequiredException(BaseException):
    pass

def custom_input(prompt=""):
    val = js.getProvidedInput()
    if val is not None:
        print(prompt + str(val))
        return val
    else:
        js.setCurrentPrompt(prompt)
        js.setIsWaitingForInput(True)
        raise InputRequiredException("INPUT_REQUIRED")

builtins.input = custom_input
      `);

      const result = await pyodideRef.current.runPythonAsync(currentTerminalInputRef.current);
      
      if (result !== undefined) {
        outputBufferRef.current.push({ type: 'output', content: String(result) });
      }
      
      setTerminalHistory([...historyBeforeRunRef.current, ...outputBufferRef.current]);
      setIsRunning(false);
      currentRunTypeRef.current = null;
    } catch (err: any) {
      if ((window as any).isWaitingForInput) {
        (window as any).isWaitingForInput = false;
        // Wait for modal
        setTerminalHistory([...historyBeforeRunRef.current, ...outputBufferRef.current]);
      } else {
        outputBufferRef.current.push({ type: 'error', content: err.message });
        setTerminalHistory([...historyBeforeRunRef.current, ...outputBufferRef.current]);
        setIsRunning(false);
        currentRunTypeRef.current = null;
      }
    }
  };

  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !pyodideRef.current || isRunning) return;

    const input = terminalInput;
    setTerminalInput('');
    setCommandHistory(prev => [...prev, input]);
    setHistoryIndex(-1);
    setTempInput('');
    runTerminalCommand(input);
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIndex = historyIndex + 1;
        if (nextIndex < commandHistory.length) {
          if (historyIndex === -1) {
            setTempInput(terminalInput);
          }
          setHistoryIndex(nextIndex);
          setTerminalInput(commandHistory[commandHistory.length - 1 - nextIndex]);
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setTerminalInput(commandHistory[commandHistory.length - 1 - nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setTerminalInput(tempInput);
      }
    }
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    providedInputsRef.current.push(inputValue);
    setInputValue('');
    setInputModal({ isOpen: false, prompt: '' });
    
    if (currentRunTypeRef.current === 'script') {
      runCode(true);
    } else if (currentRunTypeRef.current === 'terminal') {
      runTerminalCommand('', true);
    }
  };

  const handleInputCancel = () => {
    setInputModal({ isOpen: false, prompt: '' });
    setTerminalHistory([...historyBeforeRunRef.current, ...outputBufferRef.current, { type: 'error', content: 'Execução interrompida pelo usuário.' }]);
    setIsRunning(false);
    currentRunTypeRef.current = null;
  };

  const handleSave = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile?.name || 'meu_script.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleCreateNode = (name: string, type: 'file' | 'folder', parentId: string | null) => {
    const newNode: FileNode = {
      id: generateId(),
      name,
      type,
      parentId,
      content: type === 'file' ? '' : undefined
    };
    setFiles(prev => [...prev, newNode]);
    if (type === 'file') {
      setActiveFileId(newNode.id);
    }
  };

  const handleRenameNode = (id: string, newName: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleDeleteNode = (id: string) => {
    if (id === 'main.py') {
      alert('Não é possível excluir o arquivo principal main.py');
      return;
    }
    
    // Find all children to delete
    const getChildrenIds = (nodeId: string): string[] => {
      const children = files.filter(f => f.parentId === nodeId).map(f => f.id);
      return [...children, ...children.flatMap(getChildrenIds)];
    };
    
    const idsToDelete = new Set([id, ...getChildrenIds(id)]);
    setFiles(prev => prev.filter(f => !idsToDelete.has(f.id)));
    
    if (activeFileId && idsToDelete.has(activeFileId)) {
      setActiveFileId('main.py');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    alert('⚠️ Colar código não é permitido!\n\nPara aprender de verdade, você deve digitar o código. A prática leva à perfeição!');
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSuggestion(suggestions[suggestionIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  const insertSuggestion = (suggestion: string) => {
    const textarea = document.getElementById('code-editor') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const before = code.substring(0, wordStart);
    const after = code.substring(textarea.selectionStart);
    
    const newCode = before + suggestion + after;
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newCode } : f));
    setShowSuggestions(false);
    
    // Set cursor position after the inserted word
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(wordStart + suggestion.length, wordStart + suggestion.length);
    }, 0);
  };

  const handleCodeChange = (newCode: string) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newCode } : f));
    
    // Need to wait for DOM update to get correct cursor position
    setTimeout(() => {
      const textarea = document.getElementById('code-editor') as HTMLTextAreaElement;
      if (!textarea) return;
      
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = newCode.substring(0, cursorPos);
      
      // Find the current word being typed
      const match = textBeforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
      
      if (match) {
        const word = match[0];
        const start = cursorPos - word.length;
        
        const filtered = PYTHON_KEYWORDS.filter(kw => 
          kw.toLowerCase().startsWith(word.toLowerCase()) && kw !== word
        ).slice(0, 5); // Max 5 suggestions
        
        if (filtered.length > 0) {
          setSuggestions(filtered);
          setSuggestionIndex(0);
          setShowSuggestions(true);
          setWordStart(start);
          
          // Get coordinates
          const coords = getCaretCoordinates(textarea, cursorPos);
          setCaretCoords({ top: coords.top, left: coords.left, height: coords.height });
        } else {
          setShowSuggestions(false);
        }
      } else {
        setShowSuggestions(false);
      }
    }, 0);
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans">
      {/* Input Modal */}
      {inputModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#252526] border border-[#333] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 bg-[#2d2d2d] border-b border-[#333] flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-200">Entrada Solicitada</h3>
            </div>
            <form onSubmit={handleInputSubmit} className="p-4">
              <p className="text-sm text-gray-300 mb-3 font-mono">{inputModal.prompt}</p>
              <input
                type="text"
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-[#444] rounded px-3 py-2 text-gray-200 font-mono text-sm focus:outline-none focus:border-blue-500 mb-4"
                placeholder="Digite sua resposta..."
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleInputCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                >
                  Enviar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#252526] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExplorer(!showExplorer)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#333] rounded-md transition-colors"
            title="Alternar Explorador de Arquivos"
          >
            <Menu size={20} />
          </button>
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
            onClick={() => runCode(false)}
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
        {/* File Explorer */}
        {showExplorer && (
          <FileExplorer
            files={files}
            activeFileId={activeFileId}
            onSelectFile={setActiveFileId}
            onCreateNode={handleCreateNode}
            onRenameNode={handleRenameNode}
            onDeleteNode={handleDeleteNode}
          />
        )}

        {/* Editor Pane */}
        <div className="flex-1 flex flex-col border-r border-[#333]">
          <div className="px-4 py-2 bg-[#2d2d2d] text-xs font-medium text-gray-400 flex justify-between items-center">
            <span>{activeFile?.name || 'meu_script.py'}</span>
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
              onKeyDownCapture={handleEditorKeyDown}
              onClick={() => setShowSuggestions(false)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            >
              <Editor
                textareaId="code-editor"
                value={code}
                onValueChange={handleCodeChange}
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
              
              {showSuggestions && suggestions.length > 0 && (
                <div 
                  className="absolute z-50 bg-[#252526] border border-[#454545] rounded-md shadow-lg overflow-hidden"
                  style={{
                    top: caretCoords.top + caretCoords.height,
                    left: caretCoords.left,
                  }}
                >
                  {suggestions.map((sug, idx) => (
                    <div 
                      key={sug}
                      className={`px-3 py-1.5 text-sm font-mono cursor-pointer ${
                        idx === suggestionIndex ? 'bg-[#094771] text-white' : 'text-gray-300 hover:bg-[#2a2d2e]'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent blur
                        insertSuggestion(sug);
                      }}
                    >
                      {sug}
                    </div>
                  ))}
                </div>
              )}
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
                  onKeyDown={handleTerminalKeyDown}
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
