/**
 * Test Application for Card Renderer
 * Тестовое приложение для проверки функции отрисовки карт
 */

document.addEventListener('DOMContentLoaded', async () => {
    const cardContainer = document.getElementById('cardContainer');
    const renderBtn = document.getElementById('renderBtn');
    const randomBtn = document.getElementById('randomBtn');

    const userCardCount = await window.userCards.getUserCardCount();
    console.log(`Определено количество карт пользователя: ${userCardCount}`);

    // Показываем загрузку
    cardContainer.innerHTML = '<div class="loading">Загрузка базы данных...</div>';

    try {
        // Инициализируем рендерер карт
        await cardRenderer.init();
        cardContainer.innerHTML = '<div class="loading">База данных загружена. Нажмите "Отрисовать карту"</div>';

        console.log(`Загружено типов карт: ${cardRenderer.getCardTypesCount()}`);
    } catch (error) {
        cardContainer.innerHTML = `<div class="error">Ошибка загрузки: ${error.message}</div>`;
        return;
    }

    /**
     * Собирает параметры карты из формы
     * @returns {Object} - Параметры карты
     */
    function getCardParams() {
        return {
            cardTypeId: parseInt(document.getElementById('cardTypeId').value, 10),
            arrowTopLeft: document.getElementById('arrowTopLeft').checked,
            arrowTop: document.getElementById('arrowTop').checked,
            arrowTopRight: document.getElementById('arrowTopRight').checked,
            arrowRight: document.getElementById('arrowRight').checked,
            arrowBottomRight: document.getElementById('arrowBottomRight').checked,
            arrowBottom: document.getElementById('arrowBottom').checked,
            arrowBottomLeft: document.getElementById('arrowBottomLeft').checked,
            arrowLeft: document.getElementById('arrowLeft').checked,
            ownership: document.getElementById('ownership').value,
            cardLevel: document.getElementById('cardLevel').value,
            attackLevel: document.getElementById('attackLevel').value,
            attackType: document.getElementById('attackType').value,
            mechanicalDefense: document.getElementById('mechanicalDefense').value,
            electricalDefense: document.getElementById('electricalDefense').value
        };
    }

    /**
     * Устанавливает случайные параметры в форму
     */
    function setRandomParams() {
        const maxCardId = cardRenderer.getCardTypesCount();

        // Случайный ID карты
        document.getElementById('cardTypeId').value = Math.floor(Math.random() * maxCardId) + 1;

        // Случайные стрелки
        document.getElementById('arrowTopLeft').checked = Math.random() > 0.5;
        document.getElementById('arrowTop').checked = Math.random() > 0.5;
        document.getElementById('arrowTopRight').checked = Math.random() > 0.5;
        document.getElementById('arrowRight').checked = Math.random() > 0.5;
        document.getElementById('arrowBottomRight').checked = Math.random() > 0.5;
        document.getElementById('arrowBottom').checked = Math.random() > 0.5;
        document.getElementById('arrowBottomLeft').checked = Math.random() > 0.5;
        document.getElementById('arrowLeft').checked = Math.random() > 0.5;

        // Случайная принадлежность
        document.getElementById('ownership').value = Math.random() > 0.5 ? 'player' : 'rival';

        // Случайный уровень
        document.getElementById('cardLevel').value = String(Math.floor(Math.random() * 3) + 1);

        // Случайные статы
        const statChars = '0123456789ABCDEF';
        const attackTypes = 'PMEA'; // Physical, Magical, Electric, Arcane
        document.getElementById('attackLevel').value = statChars[Math.floor(Math.random() * 10)];
        document.getElementById('attackType').value = attackTypes[Math.floor(Math.random() * attackTypes.length)];
        document.getElementById('mechanicalDefense').value = statChars[Math.floor(Math.random() * 10)];
        document.getElementById('electricalDefense').value = statChars[Math.floor(Math.random() * 10)];
    }

    /**
     * Отрисовывает карту с текущими параметрами
     */
    function renderCurrentCard() {
        const params = getCardParams();
        console.log('Отрисовка карты с параметрами:', params);

        // Очищаем контейнер
        cardContainer.innerHTML = '';

        // Отрисовываем карту
        const cardElement = cardRenderer.renderCard(params);
        cardContainer.appendChild(cardElement);
    }

    // Обработчики событий
    renderBtn.addEventListener('click', renderCurrentCard);

    randomBtn.addEventListener('click', () => {
        setRandomParams();
        renderCurrentCard();
    });

    // Отрисовка при нажатии Enter в полях ввода
    document.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                renderCurrentCard();
            }
        });
    });
});

/**
 * Удобная функция для программного тестирования из консоли
 *
 * Примеры использования:
 *
 * // Простой вызов
 * testCard({ cardTypeId: 1 });
 *
 * // Полный набор параметров
 * testCard({
 *     cardTypeId: 5,
 *     arrowTopLeft: true,
 *     arrowTop: false,
 *     arrowTopRight: true,
 *     arrowRight: false,
 *     arrowBottomRight: true,
 *     arrowBottom: false,
 *     arrowBottomLeft: true,
 *     arrowLeft: false,
 *     ownership: 'rival',
 *     cardLevel: '3',
 *     attackLevel: '9',
 *     attackType: 'M',
 *     mechanicalDefense: '5',
 *     electricalDefense: '7'
 * });
 *
 * // Несколько карт подряд
 * [1, 2, 3, 4, 5].forEach(id => testCard({ cardTypeId: id }));
 *
 * // Генерация колоды и отрисовка
 * testGeneratedDeck({
 *     deck_size: 6,
 *     level_min: 0,
 *     level_max: 3,
 *     group_1_weight: 4,
 *     group_2_weight: 3,
 *     group_3_weight: 2,
 *     group_4_weight: 1
 * });
 */
function testCard(params) {
    const container = document.getElementById('cardContainer');
    if (!container) {
        console.error('Контейнер карт не найден');
        return;
    }

    const defaultParams = {
        cardTypeId: 1,
        arrowTopLeft: false,
        arrowTop: false,
        arrowTopRight: false,
        arrowRight: false,
        arrowBottomRight: false,
        arrowBottom: false,
        arrowBottomLeft: false,
        arrowLeft: false,
        ownership: 'player',
        cardLevel: '1',
        attackLevel: '5',
        attackType: 'P',
        mechanicalDefense: '3',
        electricalDefense: '2'
    };

    const finalParams = { ...defaultParams, ...params };

    container.innerHTML = '';
    const cardElement = cardRenderer.renderCard(finalParams);
    container.appendChild(cardElement);

    console.log('Карта отрисована:', finalParams);
    return cardElement;
}

/**
 * Функция для отображения нескольких карт одновременно
 *
 * Пример:
 * testMultipleCards([
 *     { cardTypeId: 1, ownership: 'player' },
 *     { cardTypeId: 2, ownership: 'rival' },
 *     { cardTypeId: 3, cardLevel: '2' }
 * ]);
 */
function testMultipleCards(paramsArray) {
    const container = document.getElementById('cardContainer');
    if (!container) {
        console.error('Контейнер карт не найден');
        return;
    }

    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '20px';
    container.style.justifyContent = 'center';

    const defaultParams = {
        cardTypeId: 1,
        arrowTopLeft: false,
        arrowTop: false,
        arrowTopRight: false,
        arrowRight: false,
        arrowBottomRight: false,
        arrowBottom: false,
        arrowBottomLeft: false,
        arrowLeft: false,
        ownership: 'player',
        cardLevel: '1',
        attackLevel: '5',
        attackType: 'P',
        mechanicalDefense: '3',
        electricalDefense: '2'
    };

    paramsArray.forEach(params => {
        const finalParams = { ...defaultParams, ...params };
        const cardElement = cardRenderer.renderCard(finalParams);
        container.appendChild(cardElement);
    });

    console.log(`Отрисовано карт: ${paramsArray.length}`);
}

/**
 * Генерация колоды карт и отображение результата
 * @param {Object} options - Параметры генерации
 * @returns {Array} - Массив сгенерированных карт
 */
function testGeneratedDeck(options) {
    try {
        const deck = cardRenderer.generateDeck(options);
        const renderParams = deck.map(card => card.renderParams);
        testMultipleCards(renderParams);
        console.log('Сгенерированная колода (коды карт):', deck.map(card => card.cardCode));
        return deck;
    } catch (error) {
        console.error('Ошибка генерации колоды:', error);
        return [];
    }
}

// Экспортируем функции в глобальную область для тестирования из консоли
window.testCard = testCard;
window.testMultipleCards = testMultipleCards;
window.testGeneratedDeck = testGeneratedDeck;
window.cardRenderer = cardRenderer;
