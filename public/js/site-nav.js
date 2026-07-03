/**
 * Site header nav: burger menu + dropdown submenus (no Elementor Pro JS)
 */
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.elementor-location-header');
  if (!header) return;

  const isDesktop = () => window.matchMedia('(min-width: 1025px)').matches;

  header.querySelectorAll('.elementor-menu-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.classList.toggle('elementor-active');
      const dropdown = toggle.parentElement?.querySelector(
        '.elementor-nav-menu--dropdown.elementor-nav-menu__container'
      );
      if (dropdown) {
        dropdown.setAttribute('aria-hidden', String(expanded));
        dropdown.classList.toggle('elementor-nav-menu--dropdown-open');
      }
    });
  });

  const submenuParents = header.querySelectorAll('.menu-item-has-children');

  const closeAllSubmenus = () => {
    submenuParents.forEach((item) => item.classList.remove('is-submenu-open'));
  };

  submenuParents.forEach((item) => {
    const link = item.querySelector(':scope > a');
    const submenu = item.querySelector(':scope > .sub-menu');
    if (!submenu) return;

    if (link && !link.querySelector('.sub-arrow')) {
      const arrow = document.createElement('span');
      arrow.className = 'sub-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<i class="fas fa-caret-down"></i>';
      link.appendChild(arrow);
    }

    item.addEventListener('mouseenter', () => {
      if (isDesktop()) {
        item.classList.add('is-submenu-open');
      }
    });

    item.addEventListener('mouseleave', () => {
      if (isDesktop()) {
        item.classList.remove('is-submenu-open');
      }
    });

    if (link) {
      link.addEventListener('click', (e) => {
        if (isDesktop()) return;

        const isOpen = item.classList.contains('is-submenu-open');
        if (!isOpen) {
          e.preventDefault();
          submenuParents.forEach((other) => {
            if (other !== item) other.classList.remove('is-submenu-open');
          });
          item.classList.add('is-submenu-open');
        }
      });
    }
  });

  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    if (!header.contains(e.target)) {
      closeAllSubmenus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllSubmenus();
  });
});
