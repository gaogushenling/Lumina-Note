import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Database,
  DatabaseColumn,
  DatabaseRow,
  DatabaseView,
  CellValue,
  CreateDatabaseOptions,
  SelectOption,
  SortRule,
  FilterGroup,
  ColumnType,
} from "@/types/database";
import { DATABASE_TEMPLATES } from "@/types/database";
import { readFile, saveFile, exists, createDir } from "@/lib/tauri";
import { useFileStore } from "./useFileStore";

// ==================== 工具函数 ====================

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getDbDir(): string {
  const vaultPath = useFileStore.getState().vaultPath;
  if (!vaultPath) throw new Error("No vault path set");
  return `${vaultPath}/Databases`;
}

function getDbPath(dbId: string): string {
  return `${getDbDir()}/${dbId}.db.json`;
}

// ==================== Store Interface ====================

interface DatabaseState {
  // 已加载的数据库
  databases: Record<string, Database>;
  
  // 当前打开的数据库 ID
  currentDbId: string | null;
  
  // 编辑状态
  editingCell: { rowId: string; columnId: string } | null;
  
  // ===== 加载/保存 =====
  loadDatabase: (dbId: string) => Promise<Database | null>;
  saveDatabase: (dbId: string) => Promise<void>;
  listDatabases: () => Promise<string[]>;
  
  // ===== 数据库操作 =====
  createDatabase: (options: CreateDatabaseOptions) => Promise<string>;
  deleteDatabase: (dbId: string) => Promise<void>;
  renameDatabase: (dbId: string, name: string) => void;
  setCurrentDb: (dbId: string | null) => void;
  
  // ===== 列操作 =====
  addColumn: (dbId: string, column: Partial<DatabaseColumn>) => void;
  updateColumn: (dbId: string, columnId: string, updates: Partial<DatabaseColumn>) => void;
  deleteColumn: (dbId: string, columnId: string) => void;
  reorderColumns: (dbId: string, columnIds: string[]) => void;
  
  // ===== 行操作 =====
  addRow: (dbId: string, cells?: Record<string, CellValue>) => string;
  updateCell: (dbId: string, rowId: string, columnId: string, value: CellValue) => void;
  deleteRow: (dbId: string, rowId: string) => void;
  duplicateRow: (dbId: string, rowId: string) => string;
  reorderRows: (dbId: string, rowIds: string[]) => void;
  
  // ===== 视图操作 =====
  addView: (dbId: string, view: Partial<DatabaseView>) => string;
  updateView: (dbId: string, viewId: string, updates: Partial<DatabaseView>) => void;
  deleteView: (dbId: string, viewId: string) => void;
  setActiveView: (dbId: string, viewId: string) => void;
  
  // ===== Select 选项操作 =====
  addSelectOption: (dbId: string, columnId: string, option: Omit<SelectOption, 'id'>) => string;
  updateSelectOption: (dbId: string, columnId: string, optionId: string, updates: Partial<SelectOption>) => void;
  deleteSelectOption: (dbId: string, columnId: string, optionId: string) => void;
  
  // ===== 编辑状态 =====
  setEditingCell: (cell: { rowId: string; columnId: string } | null) => void;
  
  // ===== 排序和筛选 =====
  setSorts: (dbId: string, viewId: string, sorts: SortRule[]) => void;
  setFilters: (dbId: string, viewId: string, filters: FilterGroup | undefined) => void;
  
  // ===== 获取处理后的数据 =====
  getFilteredSortedRows: (dbId: string) => DatabaseRow[];
}

// ==================== Store 实现 ====================

export const useDatabaseStore = create<DatabaseState>()(
  persist(
    (set, get) => ({
      databases: {},
      currentDbId: null,
      editingCell: null,
      
      // ===== 加载/保存 =====
      loadDatabase: async (dbId: string) => {
        const path = getDbPath(dbId);
        try {
          const fileExists = await exists(path);
          if (!fileExists) {
            console.warn(`Database file not found: ${path}`);
            return null;
          }
          
          const content = await readFile(path);
          const db = JSON.parse(content) as Database;
          
          set((state) => ({
            databases: { ...state.databases, [dbId]: db }
          }));
          
          return db;
        } catch (error) {
          console.error(`Failed to load database ${dbId}:`, error);
          return null;
        }
      },
      
      saveDatabase: async (dbId: string) => {
        const db = get().databases[dbId];
        if (!db) return;
        
        const dir = getDbDir();
        const dirExists = await exists(dir);
        if (!dirExists) {
          await createDir(dir);
        }
        
        const path = getDbPath(dbId);
        const content = JSON.stringify(db, null, 2);
        await saveFile(path, content);
      },
      
      listDatabases: async () => {
        const dir = getDbDir();
        try {
          const dirExists = await exists(dir);
          if (!dirExists) return [];
          
          // 这里需要一个列出目录内容的方法
          // 暂时返回已加载的数据库
          return Object.keys(get().databases);
        } catch {
          return [];
        }
      },
      
      // ===== 数据库操作 =====
      createDatabase: async (options: CreateDatabaseOptions) => {
        const dbId = generateId();
        const template = options.template ? DATABASE_TEMPLATES[options.template] : DATABASE_TEMPLATES.blank;
        const now = new Date().toISOString();
        
        const db: Database = {
          id: dbId,
          name: options.name,
          icon: options.icon,
          description: options.description,
          columns: template.columns?.map(col => ({ ...col, id: col.id || generateId() })) || [
            { id: generateId(), name: '标题', type: 'text' as ColumnType }
          ],
          rows: [],
          views: template.views?.map(v => ({ ...v, id: v.id || generateId() })) || [
            { id: generateId(), name: '表格', type: 'table' as const }
          ],
          activeViewId: '',
          createdAt: now,
          updatedAt: now,
        };
        
        // 设置活动视图
        db.activeViewId = db.views[0]?.id || '';
        
        set((state) => ({
          databases: { ...state.databases, [dbId]: db },
          currentDbId: dbId,
        }));
        
        // 保存到文件
        await get().saveDatabase(dbId);
        
        return dbId;
      },
      
      deleteDatabase: async (dbId: string) => {
        // TODO: 删除文件
        set((state) => {
          const { [dbId]: _, ...rest } = state.databases;
          return {
            databases: rest,
            currentDbId: state.currentDbId === dbId ? null : state.currentDbId,
          };
        });
      },
      
      renameDatabase: (dbId: string, name: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: { ...db, name, updatedAt: new Date().toISOString() }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      setCurrentDb: (dbId: string | null) => {
        set({ currentDbId: dbId });
      },
      
      // ===== 列操作 =====
      addColumn: (dbId: string, column: Partial<DatabaseColumn>) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const newColumn: DatabaseColumn = {
            id: generateId(),
            name: column.name || '新列',
            type: column.type || 'text',
            ...column,
          };
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: [...db.columns, newColumn],
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      updateColumn: (dbId: string, columnId: string, updates: Partial<DatabaseColumn>) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId ? { ...col, ...updates } : col
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      deleteColumn: (dbId: string, columnId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.filter(col => col.id !== columnId),
                rows: db.rows.map(row => {
                  const { [columnId]: _, ...restCells } = row.cells;
                  return { ...row, cells: restCells };
                }),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      reorderColumns: (dbId: string, columnIds: string[]) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const columnMap = new Map(db.columns.map(c => [c.id, c]));
          const reordered = columnIds.map(id => columnMap.get(id)).filter(Boolean) as DatabaseColumn[];
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: reordered,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      // ===== 行操作 =====
      addRow: (dbId: string, cells?: Record<string, CellValue>) => {
        const rowId = generateId();
        const now = new Date().toISOString();
        
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const newRow: DatabaseRow = {
            id: rowId,
            cells: cells || {},
            createdAt: now,
            updatedAt: now,
          };
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                rows: [...db.rows, newRow],
                updatedAt: now,
              }
            }
          };
        });
        get().saveDatabase(dbId);
        
        return rowId;
      },
      
      updateCell: (dbId: string, rowId: string, columnId: string, value: CellValue) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const now = new Date().toISOString();
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                rows: db.rows.map(row =>
                  row.id === rowId
                    ? {
                        ...row,
                        cells: { ...row.cells, [columnId]: value },
                        updatedAt: now,
                      }
                    : row
                ),
                updatedAt: now,
              }
            }
          };
        });
        // 防抖保存
        get().saveDatabase(dbId);
      },
      
      deleteRow: (dbId: string, rowId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                rows: db.rows.filter(row => row.id !== rowId),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      duplicateRow: (dbId: string, rowId: string) => {
        const newRowId = generateId();
        const now = new Date().toISOString();
        
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const sourceRow = db.rows.find(r => r.id === rowId);
          if (!sourceRow) return state;
          
          const newRow: DatabaseRow = {
            id: newRowId,
            cells: { ...sourceRow.cells },
            createdAt: now,
            updatedAt: now,
          };
          
          const sourceIndex = db.rows.findIndex(r => r.id === rowId);
          const newRows = [...db.rows];
          newRows.splice(sourceIndex + 1, 0, newRow);
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                rows: newRows,
                updatedAt: now,
              }
            }
          };
        });
        get().saveDatabase(dbId);
        
        return newRowId;
      },
      
      reorderRows: (dbId: string, rowIds: string[]) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const rowMap = new Map(db.rows.map(r => [r.id, r]));
          const reordered = rowIds.map(id => rowMap.get(id)).filter(Boolean) as DatabaseRow[];
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                rows: reordered,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      // ===== 视图操作 =====
      addView: (dbId: string, view: Partial<DatabaseView>) => {
        const viewId = generateId();
        
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          const newView: DatabaseView = {
            id: viewId,
            name: view.name || '新视图',
            type: view.type || 'table',
            ...view,
          };
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                views: [...db.views, newView],
                activeViewId: viewId,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
        
        return viewId;
      },
      
      updateView: (dbId: string, viewId: string, updates: Partial<DatabaseView>) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                views: db.views.map(v =>
                  v.id === viewId ? { ...v, ...updates } : v
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      deleteView: (dbId: string, viewId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db || db.views.length <= 1) return state; // 至少保留一个视图
          
          const newViews = db.views.filter(v => v.id !== viewId);
          const activeViewId = db.activeViewId === viewId ? newViews[0].id : db.activeViewId;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                views: newViews,
                activeViewId,
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      setActiveView: (dbId: string, viewId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: { ...db, activeViewId: viewId }
            }
          };
        });
      },
      
      // ===== Select 选项操作 =====
      addSelectOption: (dbId: string, columnId: string, option: Omit<SelectOption, 'id'>) => {
        const optionId = generateId();
        
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId
                    ? {
                        ...col,
                        options: [...(col.options || []), { ...option, id: optionId }]
                      }
                    : col
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
        
        return optionId;
      },
      
      updateSelectOption: (dbId: string, columnId: string, optionId: string, updates: Partial<SelectOption>) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId
                    ? {
                        ...col,
                        options: col.options?.map(opt =>
                          opt.id === optionId ? { ...opt, ...updates } : opt
                        )
                      }
                    : col
                ),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      deleteSelectOption: (dbId: string, columnId: string, optionId: string) => {
        set((state) => {
          const db = state.databases[dbId];
          if (!db) return state;
          
          return {
            databases: {
              ...state.databases,
              [dbId]: {
                ...db,
                columns: db.columns.map(col =>
                  col.id === columnId
                    ? {
                        ...col,
                        options: col.options?.filter(opt => opt.id !== optionId)
                      }
                    : col
                ),
                // 同时清除行中使用该选项的值
                rows: db.rows.map(row => {
                  const cellValue = row.cells[columnId];
                  if (cellValue === optionId) {
                    const { [columnId]: _, ...restCells } = row.cells;
                    return { ...row, cells: restCells };
                  }
                  if (Array.isArray(cellValue)) {
                    return {
                      ...row,
                      cells: {
                        ...row.cells,
                        [columnId]: cellValue.filter(v => v !== optionId)
                      }
                    };
                  }
                  return row;
                }),
                updatedAt: new Date().toISOString(),
              }
            }
          };
        });
        get().saveDatabase(dbId);
      },
      
      // ===== 编辑状态 =====
      setEditingCell: (cell) => {
        set({ editingCell: cell });
      },
      
      // ===== 排序和筛选 =====
      setSorts: (dbId: string, viewId: string, sorts: SortRule[]) => {
        get().updateView(dbId, viewId, { sorts });
      },
      
      setFilters: (dbId: string, viewId: string, filters: FilterGroup | undefined) => {
        get().updateView(dbId, viewId, { filters });
      },
      
      // ===== 获取处理后的数据 =====
      getFilteredSortedRows: (dbId: string) => {
        const db = get().databases[dbId];
        if (!db) return [];
        
        const view = db.views.find(v => v.id === db.activeViewId);
        if (!view) return db.rows;
        
        let rows = [...db.rows];
        
        // 应用筛选
        if (view.filters && view.filters.rules.length > 0) {
          rows = applyFilters(rows, view.filters, db.columns);
        }
        
        // 应用排序
        if (view.sorts && view.sorts.length > 0) {
          rows = applySorts(rows, view.sorts, db.columns);
        }
        
        return rows;
      },
    }),
    {
      name: "lumina-database-store",
      partialize: (state) => ({
        // 只持久化当前数据库 ID，数据库内容存在文件中
        currentDbId: state.currentDbId,
      }),
    }
  )
);

// ==================== 筛选/排序辅助函数 ====================

function applyFilters(rows: DatabaseRow[], filterGroup: FilterGroup, columns: DatabaseColumn[]): DatabaseRow[] {
  return rows.filter(row => evaluateFilterGroup(row, filterGroup, columns));
}

function evaluateFilterGroup(row: DatabaseRow, group: FilterGroup, columns: DatabaseColumn[]): boolean {
  if (group.rules.length === 0) return true;
  
  const results = group.rules.map(rule => {
    if ('type' in rule) {
      return evaluateFilterGroup(row, rule as FilterGroup, columns);
    }
    return evaluateFilterRule(row, rule, columns);
  });
  
  if (group.type === 'and') {
    return results.every(Boolean);
  } else {
    return results.some(Boolean);
  }
}

function evaluateFilterRule(row: DatabaseRow, rule: { columnId: string; operator: string; value: CellValue }, columns: DatabaseColumn[]): boolean {
  const cellValue = row.cells[rule.columnId];
  const column = columns.find(c => c.id === rule.columnId);
  if (!column) return true;
  
  switch (rule.operator) {
    case 'is_empty':
      return cellValue === null || cellValue === undefined || cellValue === '';
    case 'is_not_empty':
      return cellValue !== null && cellValue !== undefined && cellValue !== '';
    case 'equals':
      return cellValue === rule.value;
    case 'not_equals':
      return cellValue !== rule.value;
    case 'contains':
      return typeof cellValue === 'string' && cellValue.includes(String(rule.value));
    case 'not_contains':
      return typeof cellValue === 'string' && !cellValue.includes(String(rule.value));
    case 'is_checked':
      return cellValue === true;
    case 'is_not_checked':
      return cellValue !== true;
    case 'greater_than':
      return typeof cellValue === 'number' && typeof rule.value === 'number' && cellValue > rule.value;
    case 'less_than':
      return typeof cellValue === 'number' && typeof rule.value === 'number' && cellValue < rule.value;
    default:
      return true;
  }
}

function applySorts(rows: DatabaseRow[], sorts: SortRule[], columns: DatabaseColumn[]): DatabaseRow[] {
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const column = columns.find(c => c.id === sort.columnId);
      if (!column) continue;
      
      const aValue = a.cells[sort.columnId];
      const bValue = b.cells[sort.columnId];
      
      let comparison = 0;
      
      if (aValue === null || aValue === undefined) {
        comparison = 1;
      } else if (bValue === null || bValue === undefined) {
        comparison = -1;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
        comparison = (aValue ? 1 : 0) - (bValue ? 1 : 0);
      }
      
      if (comparison !== 0) {
        return sort.direction === 'desc' ? -comparison : comparison;
      }
    }
    return 0;
  });
}
