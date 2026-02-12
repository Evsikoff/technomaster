const OPPONENTS_DB_PATH = 'public/data/cards.db';
const OPPONENTS_AVATAR_PATH = 'public/img/opponents';
const MIN_DECK_PULSE_THRESHOLD = 5;

let currentMode = 'standard';
let opponentsList = [];
let modeProgress = { standard: 0, hard: 0, hardcore: 0 };
let userCardCount = 0;

/**
 * Создает DOM-элемент бейджа соперника.
 * @param {Object} opponent
 * @param {boolean} isLocked
 * @returns {HTMLButtonElement}
 */
function createOpponentBadge(opponent, isLocked) {
    const badge = document.createElement('button');
    badge.className = 'opponent-badge';
    badge.type = 'button';
    badge.dataset.opponentId = opponent.id;

    if (isLocked) {
        badge.classList.add('opponent-badge--locked');
        badge.setAttribute('aria-disabled', 'true');
        badge.disabled = true;
    } else {
        // Добавляем обработчик клика для запуска партии
        badge.addEventListener('click', () => {
            if (!window.partyOrchestrator?.start) {
                console.error('PartyOrchestrator: модуль не загружен.');
                return;
            }

            window.partyOrchestrator.start(opponent.id, currentMode).catch(error => {
                console.error('PartyOrchestrator: ошибка запуска партии', error);
                alert(error?.message || 'Не удалось подготовить партию.');
            });
        });
    }

    const avatar = document.createElement('img');
    avatar.className = 'opponent-avatar';
    avatar.alt = opponent.name;
    avatar.src = `${OPPONENTS_AVATAR_PATH}/${opponent.avatar}`;

    const name = document.createElement('span');
    name.className = 'opponent-name';
    name.textContent = opponent.name;

    const sequence = document.createElement('span');
    sequence.className = 'opponent-sequence';
    sequence.textContent = `Уровень ${opponent.sequence}`;

    badge.append(avatar, name, sequence);

    if (isLocked) {
        const lock = document.createElement('span');
        lock.className = 'opponent-lock';
        lock.textContent = 'Недоступно';
        badge.append(lock);
    }

    return badge;
}

/**
 * Загружает список соперников из базы данных SQLite.
 * @returns {Promise<Array<{id: number, sequence: number, name: string, avatar: string}>>}
 */
async function loadOpponentsFromDb() {
    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    const response = await fetch(OPPONENTS_DB_PATH);
    const buffer = await response.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buffer));

    const result = db.exec('SELECT id, name, avatar, sequence FROM opponents ORDER BY sequence ASC');
    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => ({
        id: Number(row[0]),
        name: row[1],
        avatar: row[2],
        sequence: Number(row[3])
    }));
}

/**
 * Отрисовывает список соперников в зависимости от текущего режима и прогресса.
 */
function renderOpponents() {
    const opponentsGrid = document.getElementById('opponentsGrid');
    if (!opponentsGrid) return;

    opponentsGrid.innerHTML = '';

    const hasLowCardCount = userCardCount < MIN_DECK_PULSE_THRESHOLD;
    const totalOpponents = opponentsList.length;

    // Определяем максимальный доступный уровень для текущего режима
    let maxUnlockedSequence = 1;

    // Находим "максимальный по сложности режим, в котором победил игрок"
    let highestModeWithWins = 'none';
    if (modeProgress.hardcore > 0) highestModeWithWins = 'hardcore';
    else if (modeProgress.hard > 0) highestModeWithWins = 'hard';
    else if (modeProgress.standard > 0) highestModeWithWins = 'standard';

    if (currentMode === 'standard') {
        if (highestModeWithWins === 'none') {
            maxUnlockedSequence = modeProgress.standard + 1;
        } else if (highestModeWithWins === 'standard') {
            maxUnlockedSequence = modeProgress.standard + 1;
        } else {
            // Если есть победы в более высоких режимах, значит стандартный пройден полностью
            maxUnlockedSequence = totalOpponents + 1;
        }
    } else if (currentMode === 'hard') {
        if (highestModeWithWins === 'standard') {
            maxUnlockedSequence = 1; // Только начали Hard
        } else if (highestModeWithWins === 'hard') {
            maxUnlockedSequence = modeProgress.hard + 1;
        } else {
            // Пройден Hardcore, значит Hard пройден полностью
            maxUnlockedSequence = totalOpponents + 1;
        }
    } else if (currentMode === 'hardcore') {
        if (highestModeWithWins === 'hard') {
            maxUnlockedSequence = 1; // Только начали Hardcore
        } else if (highestModeWithWins === 'hardcore') {
            maxUnlockedSequence = modeProgress.hardcore + 1;
        }
    }

    opponentsList.forEach(opponent => {
        const isLocked = hasLowCardCount || opponent.sequence > maxUnlockedSequence;
        const badge = createOpponentBadge(opponent, isLocked);
        opponentsGrid.append(badge);
    });

    updateTabStates();
}

/**
 * Обновляет состояние табов (активный/доступный).
 */
function updateTabStates() {
    const totalOpponents = opponentsList.length;
    const tabs = document.querySelectorAll('.mode-tab');

    tabs.forEach(tab => {
        const mode = tab.dataset.mode;
        tab.classList.toggle('active', mode === currentMode);

        let isAvailable = false;
        if (mode === 'standard') {
            isAvailable = true;
        } else if (mode === 'hard') {
            isAvailable = modeProgress.standard >= totalOpponents;
        } else if (mode === 'hardcore') {
            isAvailable = modeProgress.hard >= totalOpponents;
        }

        tab.disabled = !isAvailable;
    });
}

/**
 * Инициализирует стартовый экран.
 */
async function initStartScreen() {
    const deckBanner = document.getElementById('deckBanner');
    const guideButton = document.getElementById('guideButton');
    const guideModal = document.getElementById('guideModal');
    const guideModalClose = document.getElementById('guideModalClose');
    const modeTabs = document.getElementById('modeTabs');

    if (!deckBanner || !guideButton || !guideModal || !guideModalClose) {
        return;
    }

    const openGuideModal = () => {
        guideModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };

    const closeGuideModal = () => {
        guideModal.classList.add('hidden');
        document.body.style.overflow = '';
    };

    guideButton.addEventListener('click', openGuideModal);
    guideModalClose.addEventListener('click', closeGuideModal);
    guideModal.addEventListener('click', event => {
        if (event.target === guideModal) {
            closeGuideModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !guideModal.classList.contains('hidden')) {
            closeGuideModal();
        }
    });

    if (modeTabs) {
        modeTabs.addEventListener('click', (event) => {
            const tab = event.target.closest('.mode-tab');
            if (tab && !tab.disabled) {
                currentMode = tab.dataset.mode;
                renderOpponents();
            }
        });
    }

    try {
        console.log('StartScreen: Start initializing...');

        // Ждём завершения инициализации контроллера хранилища
        if (window.userCards?.whenReady) {
            await window.userCards.whenReady();
        }

        // Проверяем наличие незавершённой партии — если есть, перенаправляем
        if (window.userCards?.checkAndRedirectToActiveParty) {
            const redirected = await window.userCards.checkAndRedirectToActiveParty();
            if (redirected) return;
        }

        let [cardCount, maxCoolness] = await Promise.all([
            window.userCards?.getUserCardCount?.() ?? Promise.resolve(0),
            window.userCards?.getMaxOpponentCoolness?.() ?? Promise.resolve({ standard: 0, hard: 0, hardcore: 0 })
        ]);

        userCardCount = cardCount;
        modeProgress = typeof maxCoolness === 'object' ? maxCoolness : { standard: Number(maxCoolness), hard: 0, hardcore: 0 };

        // Если карт 0, генерируем стартовую колоду
        if (userCardCount === 0 && window.cardRenderer) {
            await window.cardRenderer.init();
            const rules = window.cardRenderer.getStarterDeckRules();
            if (rules) {
                const deck = window.cardRenderer.generateDeck(rules);
                if (window.userCards.saveUserDeck) {
                    await window.userCards.saveUserDeck(deck);
                    userCardCount = deck.length;
                }
            }
        }

        opponentsList = await loadOpponentsFromDb();

        // Клик по баннеру «МОЯ КОЛОДА» — переход на экран колоды
        deckBanner.addEventListener('click', () => {
            window.location.href = 'deck.html';
        });

        const hasLowCardCount = userCardCount < MIN_DECK_PULSE_THRESHOLD;
        if (hasLowCardCount) {
            deckBanner.classList.add('deck-banner--pulse');
        } else {
            deckBanner.classList.remove('deck-banner--pulse');
        }

        // Автоматически выбираем максимально доступный режим при загрузке
        if (modeProgress.hard >= opponentsList.length && opponentsList.length > 0) {
            currentMode = 'hardcore';
        } else if (modeProgress.standard >= opponentsList.length && opponentsList.length > 0) {
            currentMode = 'hard';
        } else {
            currentMode = 'standard';
        }

        renderOpponents();

    } catch (error) {
        console.error('Ошибка загрузки стартового экрана:', error);
        const grid = document.getElementById('opponentsGrid');
        if (grid) grid.innerHTML = '<p class="opponents-error">Не удалось загрузить список соперников.</p>';
    }
}

document.addEventListener('DOMContentLoaded', initStartScreen);
