// Experience accordion — one open row, inline landscape photo when expanded.
const experienceItems = document.querySelectorAll('.experience-item');

experienceItems.forEach((item) => {
    const button = item.querySelector('.service-button');
    const panel = item.querySelector('.item-panel');
    if (!button || !panel) return;

    button.addEventListener('click', () => {
        const willOpen = !item.classList.contains('active');

        experienceItems.forEach((entry) => {
            const entryButton = entry.querySelector('.service-button');
            const entryPanel = entry.querySelector('.item-panel');
            const open = entry === item && willOpen;

            entry.classList.toggle('active', open);
            if (entryButton) entryButton.setAttribute('aria-expanded', String(open));
            if (entryPanel) entryPanel.hidden = !open;
        });
    });
});
