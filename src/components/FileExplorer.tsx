import React, { useState } from 'react';
import { FileNode } from '../types';
import { File, Folder, Plus, Trash2, Edit2, ChevronRight, ChevronDown, FilePlus, FolderPlus } from 'lucide-react';

interface FileExplorerProps {
  files: FileNode[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onCreateNode: (name: string, type: 'file' | 'folder', parentId: string | null) => void;
  onRenameNode: (id: string, newName: string) => void;
  onDeleteNode: (id: string) => void;
}

export default function FileExplorer({
  files,
  activeFileId,
  onSelectFile,
  onCreateNode,
  onRenameNode,
  onDeleteNode,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [creatingIn, setCreatingIn] = useState<{ parentId: string | null, type: 'file' | 'folder' } | null>(null);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && creatingIn) {
      onCreateNode(newName.trim(), creatingIn.type, creatingIn.parentId);
    }
    setCreatingIn(null);
    setNewName('');
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && editingId) {
      onRenameNode(editingId, newName.trim());
    }
    setEditingId(null);
    setNewName('');
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(node.id);
    const isActive = activeFileId === node.id;
    const children = files.filter(f => f.parentId === node.id).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });

    return (
      <div key={node.id}>
        <div
          className={`flex items-center group px-2 py-1 cursor-pointer hover:bg-[#2a2d2e] ${isActive ? 'bg-[#37373d] text-white' : 'text-gray-300'}`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (node.type === 'folder') {
              toggleFolder(node.id);
            } else {
              onSelectFile(node.id);
            }
          }}
        >
          <div className="flex items-center flex-1 min-w-0">
            {node.type === 'folder' ? (
              <span className="mr-1 text-gray-400">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            ) : (
              <span className="mr-1 w-[14px]" />
            )}
            
            {node.type === 'folder' ? (
              <Folder size={14} className="mr-1.5 text-blue-400 flex-shrink-0" />
            ) : (
              <File size={14} className="mr-1.5 text-yellow-500 flex-shrink-0" />
            )}
            
            {editingId === node.id ? (
              <form onSubmit={handleRenameSubmit} className="flex-1" onClick={e => e.stopPropagation()}>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  className="w-full bg-[#3c3c3c] text-white px-1 text-sm outline-none border border-blue-500"
                />
              </form>
            ) : (
              <span className="truncate text-sm">{node.name}</span>
            )}
          </div>

          <div className="hidden group-hover:flex items-center gap-1 ml-2">
            {node.type === 'folder' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreatingIn({ parentId: node.id, type: 'file' });
                    setNewName('');
                    setExpandedFolders(prev => new Set(prev).add(node.id));
                  }}
                  className="p-0.5 hover:bg-[#4d4d4d] rounded text-gray-400 hover:text-white"
                  title="Novo Arquivo"
                >
                  <FilePlus size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreatingIn({ parentId: node.id, type: 'folder' });
                    setNewName('');
                    setExpandedFolders(prev => new Set(prev).add(node.id));
                  }}
                  className="p-0.5 hover:bg-[#4d4d4d] rounded text-gray-400 hover:text-white"
                  title="Nova Pasta"
                >
                  <FolderPlus size={12} />
                </button>
              </>
            )}
            {node.id !== 'root' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(node.id);
                    setNewName(node.name);
                  }}
                  className="p-0.5 hover:bg-[#4d4d4d] rounded text-gray-400 hover:text-white"
                  title="Renomear"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Tem certeza que deseja excluir '${node.name}'?`)) {
                      onDeleteNode(node.id);
                    }
                  }}
                  className="p-0.5 hover:bg-[#4d4d4d] rounded text-gray-400 hover:text-red-400"
                  title="Excluir"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        </div>

        {node.type === 'folder' && isExpanded && (
          <div>
            {creatingIn?.parentId === node.id && (
              <div className="flex items-center px-2 py-1" style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}>
                <span className="mr-1 w-[14px]" />
                {creatingIn.type === 'folder' ? (
                  <Folder size={14} className="mr-1.5 text-blue-400" />
                ) : (
                  <File size={14} className="mr-1.5 text-yellow-500" />
                )}
                <form onSubmit={handleCreateSubmit} className="flex-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onBlur={handleCreateSubmit}
                    className="w-full bg-[#3c3c3c] text-white px-1 text-sm outline-none border border-blue-500"
                    placeholder={creatingIn.type === 'folder' ? 'Nome da pasta' : 'nome_do_arquivo.py'}
                  />
                </form>
              </div>
            )}
            {children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootNodes = files.filter(f => f.parentId === null).sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  });

  return (
    <div className="w-64 bg-[#252526] border-r border-[#333] flex flex-col h-full select-none">
      <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center">
        <span>Explorador</span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              setCreatingIn({ parentId: null, type: 'file' });
              setNewName('');
            }}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
            title="Novo Arquivo"
          >
            <FilePlus size={14} />
          </button>
          <button
            onClick={() => {
              setCreatingIn({ parentId: null, type: 'folder' });
              setNewName('');
            }}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
            title="Nova Pasta"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {creatingIn?.parentId === null && (
          <div className="flex items-center px-2 py-1 pl-2">
            <span className="mr-1 w-[14px]" />
            {creatingIn.type === 'folder' ? (
              <Folder size={14} className="mr-1.5 text-blue-400" />
            ) : (
              <File size={14} className="mr-1.5 text-yellow-500" />
            )}
            <form onSubmit={handleCreateSubmit} className="flex-1">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={handleCreateSubmit}
                className="w-full bg-[#3c3c3c] text-white px-1 text-sm outline-none border border-blue-500"
                placeholder={creatingIn.type === 'folder' ? 'Nome da pasta' : 'nome_do_arquivo.py'}
              />
            </form>
          </div>
        )}
        {rootNodes.map(node => renderNode(node, 0))}
      </div>
    </div>
  );
}
