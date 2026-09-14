const navbar = document.querySelector('#navigation');
const menuButton = navbar.querySelector('.toggle');
const menu = navbar.querySelector('#expanded');
const mobile = window.matchMedia('(max-width: 63.99rem)');
function setMenu(open) {
    menuButton.classList.toggle('active', open);
    navbar.classList.toggle('active', open);
    document.body.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    menu.inert = mobile.matches && !open;
}
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
navbar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuButton.focus();
    }
});
mobile.addEventListener('change', () => setMenu(false));
setMenu(false);
document.addEventListener('scroll', () => document.body.classList.toggle('scroll', document.documentElement.scrollTop >= 100));
