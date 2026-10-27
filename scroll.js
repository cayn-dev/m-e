(() => {
  'use strict';

  const root = document.documentElement;
  const video = document.querySelector('.bg-video');
  const source = video?.querySelector('source');
  const themeToggle = document.querySelector('#scroll-theme-toggle');
  const motionToggle = document.querySelector('#scroll-motion-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const menuToggle = document.querySelector('#scroll-menu-toggle');
  const menu = document.querySelector('#scroll-menu');
  const header = document.querySelector('[data-header]');
  const splineStage = document.querySelector('#about-spline-stage');
  const splineStatus = document.querySelector('#spline-status');
  const aboutSection = document.querySelector('#about');
  const experienceDialog = document.querySelector('#experience-dialog');
  const experienceTitle = document.querySelector('#experience-title');
  const experienceDescription = document.querySelector('#experience-description');
  const experienceKicker = document.querySelector('#experience-kicker');
  const recommendedButton = document.querySelector('#experience-recommended');
  const fullExperienceButton = document.querySelector('#experience-full');
  const closeExperienceButton = document.querySelector('#experience-close');
  const experienceSettingsButton = document.querySelector('#experience-settings');
  let splineApplication = null;
  let splineRuntimePromise = null;
  let splineLoadPromise = null;
  let splineObserver = null;
  let splineGeneration = 0;
  let previousFocus = null;
  let detectedProfile = 'full';
  let recommendedMode = 'performance';
  let userMotionPreference = '';

  try { userMotionPreference = localStorage.getItem('cayn-scroll-motion') || ''; } catch { /* Storage can be blocked. */ }
  if (root.dataset.motion !== 'full' && root.dataset.motion !== 'reduce') {
    root.dataset.motion = userMotionPreference === 'full' || userMotionPreference === 'reduce'
      ? userMotionPreference
      : 'full';
  }

  const setTheme = (theme, persist = false) => {
    const dark = theme !== 'light';
    root.dataset.theme = dark ? 'dark' : 'light';
    if (themeMeta) themeMeta.content = dark ? '#000000' : '#f4f5f6';
    if (themeToggle) {
      themeToggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
      themeToggle.setAttribute('aria-pressed', String(dark));
    }
    if (persist) {
      try { localStorage.setItem('cayn-theme', root.dataset.theme); } catch { /* Storage is optional. */ }
    }
  };

  const playVideo = async () => {
    if (!video || root.dataset.motion === 'reduce' || document.hidden || root.dataset.experience === 'performance' || root.dataset.experience === 'pending') return;
    try { await video.play(); } catch { /* Motion controls still work if autoplay is unavailable. */ }
  };

  const updateMotionControl = () => {
    const reduced = root.dataset.motion === 'reduce';
    if (motionToggle) {
      motionToggle.textContent = reduced ? 'Enable motion' : 'Pause motion';
      motionToggle.setAttribute('aria-pressed', String(!reduced));
      motionToggle.setAttribute('aria-label', reduced ? 'Enable motion and animations' : 'Pause motion and animations');
    }
  };

  const revealEverything = () => {
    document.querySelectorAll('[data-reveal]').forEach(item => item.classList.add('is-visible'));
  };

  const setMotion = (mode, persist = false) => {
    root.dataset.motion = mode;
    if (persist) {
      userMotionPreference = mode;
      try { localStorage.setItem('cayn-scroll-motion', mode); } catch { /* Storage is optional. */ }
    }
    updateMotionControl();
    if (mode === 'reduce') {
      video?.pause();
      splineApplication?.stop();
      revealEverything();
    } else {
      playVideo();
      splineApplication?.play();
    }
  };

  setTheme(root.dataset.theme, false);
  updateMotionControl();
  if (root.dataset.motion === 'reduce') video?.pause();

  themeToggle?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
  motionToggle?.addEventListener('click', () => setMotion(root.dataset.motion === 'reduce' ? 'full' : 'reduce', true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video?.pause();
    else if (root.dataset.motion === 'full') playVideo();
  });
  [video, source].filter(Boolean).forEach(item => item.addEventListener('error', () => root.dataset.videoState = 'unavailable'));

  const closeMenu = () => {
    if (!menu || !menuToggle) return;
    menu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
  };
  menuToggle?.addEventListener('click', () => {
    const opening = menu?.hidden;
    if (!menu || !menuToggle) return;
    menu.hidden = !opening;
    menuToggle.setAttribute('aria-expanded', String(Boolean(opening)));
    menuToggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => { if (innerWidth > 560) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

  const detectDeviceProfile = () => {
    const isTouchPhone = matchMedia('(max-width: 840px) and (pointer: coarse)').matches
      || (navigator.maxTouchPoints > 0 && innerWidth <= 840);
    if (isTouchPhone) return 'mobile';

    const cores = Number(navigator.hardwareConcurrency) || 0;
    const memory = Number(navigator.deviceMemory) || 0;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const slowConnection = Boolean(connection && (connection.saveData || /^(slow-2g|2g)$/.test(connection.effectiveType || '')));
    const limitedHardware = (cores > 0 && cores <= 2)
      || (memory > 0 && memory <= 2)
      || (cores > 0 && cores <= 4 && memory > 0 && memory <= 4);
    return limitedHardware || slowConnection ? 'performance' : 'full';
  };

  const loadSplineRuntime = () => {
    if (!splineRuntimePromise) {
      splineRuntimePromise = import('https://cdn.spline.design/@splinetool/runtime@2.0.103/build/runtime.js')
        .catch(error => { splineRuntimePromise = null; throw error; });
    }
    return splineRuntimePromise;
  };

  const stopSplineScene = () => {
    splineGeneration += 1;
    splineObserver?.disconnect();
    splineObserver = null;
    splineLoadPromise = null;
    const app = splineApplication;
    splineApplication = null;
    try { app?.dispose(); } catch { /* Ignore cleanup errors from a stale WebGL context. */ }
    splineStage?.querySelector('canvas')?.remove();
    if (splineStatus) {
      splineStatus.hidden = true;
      splineStatus.textContent = '';
    }
    if (splineStage) {
      splineStage.dataset.splineState = 'idle';
      splineStage.hidden = true;
    }
  };

  const loadSplineScene = () => {
    if (!splineStage || root.dataset.experience !== 'full' || splineLoadPromise) return splineLoadPromise;
    const sceneUrl = splineStage.dataset.scene;
    if (!sceneUrl) return null;

    splineStage.hidden = false;
    splineStage.dataset.splineState = 'loading';
    if (splineStatus) {
      splineStatus.hidden = false;
      splineStatus.textContent = 'Preparing the interactive mark…';
    }

    const generation = ++splineGeneration;
    try { splineApplication?.dispose(); } catch { /* A failed prior canvas may already be gone. */ }
    splineApplication = null;
    splineStage.querySelector('canvas')?.remove();
    const canvas = document.createElement('canvas');
    canvas.className = 'about-spline-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive glass Cayn sculpture');
    splineStage.insertBefore(canvas, splineStatus || null);

    splineLoadPromise = (async () => {
      try {
        const { Application } = await loadSplineRuntime();
        if (generation !== splineGeneration || root.dataset.experience !== 'full') return;
        const app = new Application(canvas);
        splineApplication = app;
        await app.load(sceneUrl);
        if (generation !== splineGeneration || root.dataset.experience !== 'full') {
          app.dispose();
          if (splineApplication === app) splineApplication = null;
          return;
        }
        // Give the scene a wider safety margin so the mark stays inside the About card.
        app.setZoom(.48);
        app.setBackgroundColor('transparent');
        if (root.dataset.motion === 'reduce') app.stop();
        splineStage.dataset.splineState = 'ready';
        if (splineStatus) splineStatus.hidden = true;
      } catch {
        if (generation !== splineGeneration || root.dataset.experience !== 'full') return;
        try { splineApplication?.dispose(); } catch { /* Ignore cleanup errors from a failed scene load. */ }
        splineApplication = null;
        splineStage.dataset.splineState = 'error';
        if (splineStatus) {
          splineStatus.hidden = false;
          splineStatus.textContent = 'The 3D mark could not load. The rest of the portfolio is still available.';
        }
        splineLoadPromise = null;
      }
    })();
    return splineLoadPromise;
  };

  const observeSplineScene = () => {
    if (!aboutSection || !splineStage || root.dataset.experience !== 'full') return;
    splineObserver?.disconnect();
    if (!('IntersectionObserver' in window)) {
      loadSplineScene();
      return;
    }
    splineObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || root.dataset.experience !== 'full') return;
      splineObserver?.disconnect();
      splineObserver = null;
      loadSplineScene();
    }, { rootMargin: '240px 0px', threshold: 0 });
    splineObserver.observe(aboutSection);
  };

  const applyExperience = (mode, persist = true) => {
    root.dataset.experience = mode;
    if (persist) {
      try { localStorage.setItem('cayn-experience-mode', mode); } catch { /* The page still works without storage. */ }
    }
    if (mode === 'full') {
      if (root.dataset.motion === 'full') playVideo();
      splineApplication?.play();
      observeSplineScene();
    } else if (mode === 'mobile') {
      if (root.dataset.motion === 'full') playVideo(); else video?.pause();
      stopSplineScene();
    } else {
      video?.pause();
      stopSplineScene();
    }
  };

  const openExperienceDialog = reason => {
    if (!experienceDialog || !experienceTitle || !experienceDescription || !recommendedButton) return;
    previousFocus = document.activeElement;
    recommendedMode = reason === 'mobile' ? 'mobile' : 'performance';
    if (reason === 'mobile') {
      experienceKicker.textContent = 'Designed for your phone';
      experienceTitle.textContent = 'Try the mobile experience.';
      experienceDescription.textContent = 'A lighter mobile setup skips the 3D sculpture, while keeping the full portfolio, every text section and the homepage entrance animation.';
      recommendedButton.textContent = 'Use the mobile version';
      fullExperienceButton.textContent = 'Continue with the 3D scene';
    } else if (reason === 'performance') {
      experienceKicker.textContent = 'A smoother fit for this computer';
      experienceTitle.textContent = 'Keep the page feeling fast.';
      experienceDescription.textContent = 'This device reports limited memory or processing capacity. Performance mode skips the 3D sculpture and keeps the portfolio text and lightweight page animations.';
      recommendedButton.textContent = 'Enable performance mode';
      fullExperienceButton.textContent = 'Continue with the 3D scene';
    } else {
      experienceKicker.textContent = 'Portfolio preferences';
      experienceTitle.textContent = 'Choose your experience.';
      experienceDescription.textContent = 'The lighter experience skips the 3D sculpture to save graphics and memory, while keeping the portfolio content and homepage animation.';
      recommendedButton.textContent = 'Enable performance mode';
      fullExperienceButton.textContent = 'Use the full experience';
    }
    root.dataset.experiencePrompt = 'open';
    experienceDialog.hidden = false;
    requestAnimationFrame(() => recommendedButton.focus());
  };

  const closeExperienceDialog = () => {
    if (!experienceDialog) return;
    experienceDialog.hidden = true;
    root.removeAttribute('data-experience-prompt');
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  };

  const chooseExperience = mode => {
    applyExperience(mode, true);
    closeExperienceDialog();
  };

  recommendedButton?.addEventListener('click', () => chooseExperience(recommendedMode));
  fullExperienceButton?.addEventListener('click', () => chooseExperience('full'));
  closeExperienceButton?.addEventListener('click', () => chooseExperience('full'));
  experienceSettingsButton?.addEventListener('click', () => {
    detectedProfile = detectDeviceProfile();
    openExperienceDialog(detectedProfile === 'full' ? 'settings' : detectedProfile);
  });
  experienceDialog?.addEventListener('click', event => {
    if (event.target === experienceDialog) chooseExperience('full');
  });
  document.addEventListener('keydown', event => {
    if (!experienceDialog || experienceDialog.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      chooseExperience('full');
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...experienceDialog.querySelectorAll('button:not([disabled])')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  detectedProfile = detectDeviceProfile();
  let savedExperience = '';
  try { savedExperience = localStorage.getItem('cayn-experience-mode') || ''; } catch { /* Storage is optional. */ }
  if (['full', 'mobile', 'performance'].includes(savedExperience)) {
    applyExperience(savedExperience, false);
  } else if (detectedProfile === 'mobile' || detectedProfile === 'performance') {
    applyExperience('pending', false);
    openExperienceDialog(detectedProfile);
  } else {
    applyExperience('full', false);
  }

  document.querySelectorAll('[data-stagger]').forEach(group => {
    [...group.children].filter(item => item.matches('[data-reveal]')).forEach((item, index) => {
      item.style.setProperty('--reveal-delay', `${Math.min(index * 110, 440)}ms`);
    });
  });

  const reveals = [...document.querySelectorAll('[data-reveal]')];
  if (root.dataset.motion === 'reduce' || !('IntersectionObserver' in window)) {
    revealEverything();
  } else {
    root.classList.add('js-ready');
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -9% 0px' });
    reveals.forEach(item => revealObserver.observe(item));
  }

  const navLinks = [...document.querySelectorAll('.scroll-nav a, .scroll-menu a[href^="#"]')];
  const sections = [...document.querySelectorAll('#scroll-site main > section[id]')];
  const contactCta = header?.querySelector('.mini-button');
  let scrollFrame = 0;
  const syncScrollState = () => {
    scrollFrame = 0;
    const marker = Math.max(110, Math.min(250, innerHeight * .35));
    let activeSection = sections[0];
    sections.forEach(section => {
      if (section.getBoundingClientRect().top <= marker) activeSection = section;
    });
    const activeHref = activeSection ? `#${activeSection.id}` : '#home';
    navLinks.forEach(link => {
      if (link.getAttribute('href') === activeHref) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (activeHref === '#contact') contactCta?.setAttribute('aria-current', 'page');
    else contactCta?.removeAttribute('aria-current');
    header?.classList.toggle('is-scrolled', scrollY > 18);
  };
  const requestScrollSync = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(syncScrollState);
  };
  addEventListener('scroll', requestScrollSync, { passive: true });
  addEventListener('resize', requestScrollSync, { passive: true });
  requestScrollSync();

  const form = document.querySelector('#scroll-contact-form');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    const name = form.querySelector('#scroll-name');
    const email = form.querySelector('#scroll-email');
    const message = form.querySelector('#scroll-message');
    const status = document.querySelector('#scroll-form-status');
    if (!name || !email || !message) return;
    [name, message].forEach(field => field.setCustomValidity(field.value.trim() ? '' : 'Please fill in this field.'));
    if (!form.reportValidity()) return;
    const subject = `Website enquiry from ${name.value.trim()}`;
    const body = `Name: ${name.value.trim()}\nEmail: ${email.value.trim()}\n\n${message.value.trim()}`;
    if (status) status.textContent = 'Opening your email app with a draft. You can also write directly to jacopo.dev0@gmail.com.';
    location.href = `mailto:jacopo.dev0@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
  form?.querySelectorAll('input, textarea').forEach(field => field.addEventListener('input', () => field.setCustomValidity('')));

  const year = document.querySelector('#scroll-year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
