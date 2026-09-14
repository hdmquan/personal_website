const experienceItems = document.querySelectorAll('.experience-item');
const experienceImage = document.querySelector('#experience-image img');
const experiencePicture = document.querySelector('#experience-image');
const experienceProjects = document.querySelector('#experience-projects');

experienceItems.forEach((item) => {
    const button = item.querySelector('.service-button');
    button.addEventListener('click', () => {
        experienceItems.forEach((entry) => {
            const active = entry === item;
            entry.classList.toggle('active', active);
            entry.querySelector('.service-button').setAttribute('aria-expanded', String(active));
            entry.querySelector('.item-p').hidden = !active;
        });
        const hasImage = Boolean(item.dataset.image);
        experiencePicture.hidden = !hasImage;
        experienceProjects.hidden = hasImage;
        if (experienceImage && hasImage) {
            experienceImage.src = item.dataset.image;
            experienceImage.alt = item.dataset.imageAlt;
        }
    });
});
