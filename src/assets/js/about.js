document.querySelectorAll('.faq-item').forEach((item, index) => {
    const button = item.querySelector('.service-button');
    const panel = item.querySelector('.item-p');
    panel.id = `skill-detail-${index}`;
    button.setAttribute('aria-controls', panel.id);
    function sync() {
        const open = item.classList.contains('active');
        button.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
    }
    sync();
    button.addEventListener('click', () => {
        item.classList.toggle('active');
        sync();
    });
});
