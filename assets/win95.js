(function () {
  // Desktop icons - single source of truth. Add new apps here.
  const DESKTOP_ICONS = [
    { label: 'Game',         icon: '\u{1F3AE}', href: '#',              title: 'Coming soon' },
    { label: 'Media Player', icon: '\u{1F3B5}', href: '/media-player/', title: 'Media Player' },
    { label: 'Cricket Sim',  icon: '\u{1F3CF}', href: '/cricket-sim/',  title: 'Cricket Sim' },
    { label: 'To do',        icon: '\u{1F4DD}', href: '/to-do/',        title: 'To do' },
    { label: 'Calculator',   icon: '\u{1F4DF}', href: '/calculator/',   title: 'Calculator' },
    { label: 'Snake',        icon: '\u{1F40D}', href: '/snake/',        title: 'Snake' }
  ];

  function renderDesktop(container) {
    if (container.children.length > 0) return;
    DESKTOP_ICONS.forEach((icon) => {
      const a = document.createElement('a');
      a.className = 'icon';
      a.href = icon.href;
      a.title = icon.title;
      const img = document.createElement('div');
      img.className = 'icon-img';
      img.textContent = icon.icon;
      const label = document.createElement('div');
      label.className = 'icon-label';
      label.textContent = icon.label;
      a.appendChild(img);
      a.appendChild(label);
      container.appendChild(a);
    });
  }

  class Win95Window {
    constructor(element) {
      this.el = element;
      this.titleBar = element.querySelector('.title-bar');
      this.title = element.dataset.title || 'Window';
      this.icon = element.dataset.icon || '';
      this.closeHref = element.dataset.closeHref || '';
      this.isMaximized = false;
      this.isMinimized = false;
      this.savedStyle = null;

      this.initDrag();
      this.initButtons();
      this.addToTaskbar();
    }

    getPoint(e) {
      return e.touches
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY };
    }

    initDrag() {
      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;
      const self = this;

      const startDrag = (e) => {
        if (e.target.closest('.title-btn')) return;
        if (self.isMaximized) return;
        const p = self.getPoint(e);
        const rect = self.el.getBoundingClientRect();
        offsetX = p.x - rect.left;
        offsetY = p.y - rect.top;
        self.el.style.left = rect.left + 'px';
        self.el.style.top = rect.top + 'px';
        self.el.style.transform = 'none';
        dragging = true;
        if (e.type === 'mousedown') e.preventDefault();
      };

      const moveDrag = (e) => {
        if (!dragging) return;
        const p = self.getPoint(e);
        let x = p.x - offsetX;
        let y = p.y - offsetY;
        const minVisible = 60;
        const taskbar = 40;
        x = Math.max(-self.el.offsetWidth + minVisible, Math.min(window.innerWidth - minVisible, x));
        y = Math.max(0, Math.min(window.innerHeight - taskbar - 20, y));
        self.el.style.left = x + 'px';
        self.el.style.top = y + 'px';
        if (e.cancelable) e.preventDefault();
      };

      const endDrag = () => { dragging = false; };

      this.titleBar.addEventListener('mousedown', startDrag);
      this.titleBar.addEventListener('touchstart', startDrag, { passive: false });
      document.addEventListener('mousemove', moveDrag);
      document.addEventListener('touchmove', moveDrag, { passive: false });
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchend', endDrag);

      this.titleBar.addEventListener('dblclick', (e) => {
        if (e.target.closest('.title-btn')) return;
        this.toggleMaximize();
      });
    }

    initButtons() {
      const minBtn = this.el.querySelector('.title-btn.minimize');
      const maxBtn = this.el.querySelector('.title-btn.maximize');
      const closeBtn = this.el.querySelector('.title-btn.close');

      if (minBtn) minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimize();
      });
      if (maxBtn) maxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMaximize();
      });
      if (closeBtn) closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    minimize() {
      this.el.style.display = 'none';
      this.isMinimized = true;
      if (this.taskbarBtn) this.taskbarBtn.classList.remove('active');
    }

    restore() {
      this.el.style.display = '';
      this.isMinimized = false;
      if (this.taskbarBtn) this.taskbarBtn.classList.add('active');
    }

    toggleMaximize() {
      if (this.isMaximized) {
        if (this.savedStyle) {
          this.el.style.left = this.savedStyle.left;
          this.el.style.top = this.savedStyle.top;
          this.el.style.width = this.savedStyle.width;
          this.el.style.height = this.savedStyle.height;
          this.el.style.transform = this.savedStyle.transform;
        }
        this.isMaximized = false;
      } else {
        this.savedStyle = {
          left: this.el.style.left,
          top: this.el.style.top,
          width: this.el.style.width,
          height: this.el.style.height,
          transform: this.el.style.transform
        };
        this.el.style.left = '0';
        this.el.style.top = '0';
        this.el.style.width = '100vw';
        this.el.style.height = 'calc(100vh - 40px)';
        this.el.style.transform = 'none';
        this.isMaximized = true;
      }
    }

    close() {
      if (this.closeHref) {
        window.location.href = this.closeHref;
      } else {
        this.el.remove();
        if (this.taskbarBtn) this.taskbarBtn.remove();
      }
    }

    addToTaskbar() {
      const apps = document.querySelector('.taskbar-apps');
      if (!apps) return;
      const btn = document.createElement('div');
      btn.className = 'taskbar-app active';
      const iconSpan = this.icon ? '<span>' + this.icon + '</span>' : '';
      btn.innerHTML = iconSpan + '<span class="taskbar-app-text">' + this.title + '</span>';
      btn.addEventListener('click', () => {
        if (this.isMinimized) this.restore();
        else this.minimize();
      });
      apps.appendChild(btn);
      this.taskbarBtn = btn;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.desktop').forEach(renderDesktop);
    document.querySelectorAll('.window').forEach((el) => new Win95Window(el));

    const clock = document.querySelector('.clock');
    if (clock) {
      const update = () => {
        const now = new Date();
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        clock.textContent = h + ':' + m;
      };
      update();
      setInterval(update, 10000);
    }
  });
})();
