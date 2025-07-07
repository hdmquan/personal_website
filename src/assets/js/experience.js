const experienceItems = document.querySelectorAll(".experience-item");
const experienceImage = document
    .getElementById("experience-image")
    .querySelector("img");

// Map each item to its corresponding image path
const imageMap = {
    "Math Song": "/assets/images/company/math_song_image.jpg",
    "Fair Dinkum Systems": "/assets/images/company/fair_dinkum_image.jpg",
    "A.I.gorithm": "/assets/images/company/aigorithm_image.jpg",
    "Lux Aerobot": "/assets/images/company/lux_image.jpg",
};

experienceItems.forEach((item) => {
    const button = item.querySelector(".service-button");
    const companyName = button
        .querySelector(".button-text")
        .childNodes[0].textContent.trim();

    button.addEventListener("click", () => {
        // Remove active from all
        experienceItems.forEach((el) => el.classList.remove("active"));

        // Set active only on this one
        item.classList.add("active");

        // Update image
        if (imageMap[companyName]) {
            experienceImage.src = imageMap[companyName];
            experienceImage.alt = companyName;
        }
    });
});
