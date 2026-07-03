(function () {
  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function initHubToc(content, tocWidget, tocBody) {
    const groups = [...content.querySelectorAll('.hub-page-links .alpha-group')];
    if (groups.length === 0) return false;

    tocWidget.classList.add('hub-page-toc');

    const list = document.createElement('ul');
    list.className = 'hub-toc-grid';

    groups.forEach((group) => {
      const letter =
        group.querySelector('.hub-group__letter')?.textContent?.trim() ||
        group.id.replace(/^hub-/, '');
      const id = group.id || `hub-${slugify(letter)}`;
      if (!group.id) group.id = id;

      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${id}`;
      link.textContent = letter;
      link.setAttribute('aria-label', `Ga naar ${letter}`);
      item.appendChild(link);
      list.appendChild(item);
    });

    tocBody.innerHTML = '';
    tocBody.appendChild(list);
    return true;
  }

  function initToc() {
    const content =
      document.querySelector('.inner-article-content') ||
      document.querySelector('.elementor-element-f97e369 .elementor-widget-container');
    const tocWidget =
      document.querySelector('.inner-article-toc') ||
      document.querySelector('.elementor-element-560700d3');
    const tocBody = tocWidget?.querySelector('.elementor-toc__body');
    if (!content || !tocBody || !tocWidget) return;

    tocWidget.classList.add('inner-article-toc');

    if (initHubToc(content, tocWidget, tocBody)) {
      bindTocToggle(tocWidget);
      return;
    }

    const headings = [...content.querySelectorAll('h2, h3, h4, h5, h6')].filter(
      (heading) => !heading.closest('.hub-page-links')
    );

    if (headings.length === 0) {
      tocBody.innerHTML =
        '<div class="elementor-toc__no-headings">Er zijn geen kopteksten gevonden op deze pagina.</div>';
      bindTocToggle(tocWidget);
      return;
    }

    const usedIds = new Set();
    headings.forEach((heading) => {
      if (!heading.id) {
        let base = slugify(heading.textContent || 'sectie');
        let id = base;
        let n = 2;
        while (usedIds.has(id)) {
          id = `${base}-${n++}`;
        }
        heading.id = id;
        usedIds.add(id);
      }
    });

    const list = document.createElement('ul');
    list.className = 'elementor-toc__list-wrapper';

    headings.forEach((heading) => {
      const level = Number(heading.tagName.slice(1));
      const item = document.createElement('li');
      item.className = `elementor-toc__list-item elementor-toc__list-item--level-${level}`;
      const link = document.createElement('a');
      link.className = 'elementor-toc__list-item-text';
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent?.trim() || '';
      item.appendChild(link);
      list.appendChild(item);
    });

    tocBody.innerHTML = '';
    tocBody.appendChild(list);
    bindTocToggle(tocWidget);
  }

  function bindTocToggle(tocWidget) {
    const expandBtn = tocWidget.querySelector('.elementor-toc__toggle-button--expand');
    const collapseBtn = tocWidget.querySelector('.elementor-toc__toggle-button--collapse');

    function setExpanded(expanded) {
      tocWidget.classList.toggle('elementor-toc--collapsed', !expanded);
      expandBtn?.setAttribute('aria-expanded', String(expanded));
      collapseBtn?.setAttribute('aria-expanded', String(expanded));
    }

    expandBtn?.addEventListener('click', () => setExpanded(true));
    collapseBtn?.addEventListener('click', () => setExpanded(false));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToc);
  } else {
    initToc();
  }
})();
