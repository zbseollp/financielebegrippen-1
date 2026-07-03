/**
 * Homepage interactivity: Swiper carousel only (nav is in site-nav.js)
 */
document.addEventListener('DOMContentLoaded', () => {
  const swiperEl = document.querySelector('.elementor-main-swiper.swiper');
  if (swiperEl && typeof Swiper !== 'undefined') {
    new Swiper(swiperEl, {
      slidesPerView: 3,
      spaceBetween: 20,
      loop: true,
      pagination: {
        el: swiperEl.querySelector('.swiper-pagination'),
        clickable: true,
      },
      breakpoints: {
        0: { slidesPerView: 1 },
        768: { slidesPerView: 2 },
        1024: { slidesPerView: 3 },
      },
    });
  }
});
