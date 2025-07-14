document.addEventListener("DOMContentLoaded", function () {
    console.log("Tech ribbon script loaded");
    const track = document.getElementById("techTrack");
    const ribbon = document.getElementById("techRibbon");

    console.log("Track element:", track);
    console.log("Ribbon element:", ribbon);

    // Check if elements exist
    if (!track || !ribbon) {
        console.error("Tech ribbon elements not found");
        return;
    }

    console.log("Tech ribbon elements found, setting up infinite scroll");

    // Clone all images for seamless infinite scroll
    const images = track.querySelectorAll("img");
    images.forEach((img) => {
        const clone = img.cloneNode(true);
        track.appendChild(clone);
    });

    function pauseScroll() {
        track.classList.add("paused");
    }

    function resumeScroll() {
        track.classList.remove("paused");
    }

    // Desktop hover
    ribbon.addEventListener("mouseenter", pauseScroll);
    ribbon.addEventListener("mouseleave", resumeScroll);

    // Touch/Swipe
    ribbon.addEventListener("pointerdown", pauseScroll);
    ribbon.addEventListener("pointerup", resumeScroll);
    ribbon.addEventListener("pointercancel", resumeScroll);
});
