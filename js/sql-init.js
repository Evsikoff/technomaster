/**
 * Утилита для инициализации SQL.js с корректными путями к WASM-файлу.
 */
window.SqlLoader = {
    /**
     * Инициализирует SQL.js.
     * @returns {Promise<any>}
     */
    init: async function() {
        if (typeof initSqlJs !== 'function') {
            throw new Error('initSqlJs is not defined. Make sure js/vendor/sql-wasm.js is loaded.');
        }
        return await initSqlJs({
            locateFile: file => `js/vendor/${file}`
        });
    }
};
