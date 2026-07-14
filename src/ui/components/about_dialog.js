/**
 * About Dialog Component
 *
 * A modal that shows a product's name, version, license, homepage and
 * third-party credits. It knows NOTHING about which product — the caller
 * supplies all of it.
 *
 * It used to hardcode EcoAgent's: PRODUCT_NAME, the GitHub URL, the tagline
 * ("Heterogeneous-agent, stock-flow-consistent macroeconomic simulation") and
 * two dependency lists. A library that ships an About box for somebody else's
 * application is not a library.
 *
 * EcoAgent's values now live in ui/js/ecoagent/about.js and are pushed in.
 *
 * @typedef {{name: string, license: string, url: string}} Dep
 * @typedef {{title: string, deps: Dep[]}} DepSection
 */

import { ManagedWindow } from './managed_window.js';

function createExternalLink(text, url, className) {
    const a = document.createElement('a');
    a.className = className;
    a.textContent = text;
    a.href = url;
    a.title = url;
    a.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(url, '_blank');
    });
    return a;
}

function buildDepSection(title, deps) {
    const section = document.createElement('div');
    section.className = 'twm-about-dialog__section';

    const heading = document.createElement('div');
    heading.className = 'twm-about-dialog__section-title';
    heading.textContent = title;
    section.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'twm-about-dialog__dep-list';

    for (const dep of deps) {
        const row = document.createElement('div');
        row.className = 'twm-about-dialog__dep';

        const link = createExternalLink(dep.name, dep.url, 'twm-about-dialog__dep-name');
        row.appendChild(link);

        const lic = document.createElement('span');
        lic.className = 'twm-about-dialog__dep-license';
        lic.textContent = dep.license;
        row.appendChild(lic);

        list.appendChild(row);
    }

    section.appendChild(list);
    return section;
}

/**
 * Show the About dialog for whatever product the caller names.
 *
 * @param {Object} product
 * @param {string} product.name      Product name — the title and the heading.
 * @param {string} [product.version]
 * @param {string} [product.tagline]
 * @param {string} [product.license] Shown as "License: <x>"; omitted if absent.
 * @param {string} [product.url]     Homepage; omitted if absent.
 * @param {string} [product.urlLabel='Homepage']
 * @param {string} [product.logo='info'] Material symbol shown beside the title.
 * @param {DepSection[]} [product.credits=[]] Third-party credit sections.
 * @returns {Promise<void>} Resolves when the dialog is closed.
 */
export function showAboutDialog(product = {}) {
    const {
        name = 'Application',
        version = '',
        tagline = '',
        license = '',
        url = '',
        urlLabel = 'Homepage',
        logo = 'info',
        credits = [],
    } = product;

    return new Promise((resolve) => {
        let resolved = false;

        const finish = () => {
            if (resolved) return;
            resolved = true;
            dialogWindow.close();
            resolve();
        };

        // --- Content ---
        const contentEl = document.createElement('div');
        contentEl.className = 'twm-about-dialog__content';

        // Header
        const header = document.createElement('div');
        header.className = 'twm-about-dialog__header';

        const logoEl = document.createElement('span');
        logoEl.className = 'twm-about-dialog__logo material-symbols-outlined';
        logoEl.textContent = logo;
        header.appendChild(logoEl);

        const title = document.createElement('h2');
        title.className = 'twm-about-dialog__title';
        title.textContent = name;
        header.appendChild(title);

        if (version) {
            const versionEl = document.createElement('div');
            versionEl.className = 'twm-about-dialog__version';
            versionEl.textContent = `Version ${version}`;
            header.appendChild(versionEl);
        }

        if (tagline) {
            const taglineEl = document.createElement('div');
            taglineEl.className = 'twm-about-dialog__tagline';
            taglineEl.textContent = tagline;
            header.appendChild(taglineEl);
        }

        contentEl.appendChild(header);

        // Body (scrollable)
        const body = document.createElement('div');
        body.className = 'twm-about-dialog__body';

        // Project section — only if there is something to put in it.
        if (url || license) {
            const projectSection = document.createElement('div');
            projectSection.className = 'twm-about-dialog__section';

            const projectTitle = document.createElement('div');
            projectTitle.className = 'twm-about-dialog__section-title';
            projectTitle.textContent = 'Project';
            projectSection.appendChild(projectTitle);

            const links = document.createElement('div');
            links.className = 'twm-about-dialog__links';

            if (url) {
                const link = createExternalLink(urlLabel, url, 'twm-about-dialog__link');
                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined';
                icon.textContent = 'open_in_new';
                link.prepend(icon);
                links.appendChild(link);
            }

            if (license) {
                const licenseSpan = document.createElement('span');
                licenseSpan.className = 'twm-about-dialog__license-text';
                const licIcon = document.createElement('span');
                licIcon.className = 'material-symbols-outlined';
                licIcon.textContent = 'license';
                licenseSpan.appendChild(licIcon);
                licenseSpan.appendChild(document.createTextNode(`License: ${license}`));
                links.appendChild(licenseSpan);
            }

            projectSection.appendChild(links);
            body.appendChild(projectSection);
        }

        for (const section of credits) {
            body.appendChild(buildDepSection(section.title, section.deps ?? []));
        }

        contentEl.appendChild(body);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'twm-about-dialog__footer';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'twm-about-dialog__btn twm-about-dialog__btn--close';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', finish);
        footer.appendChild(closeBtn);

        contentEl.appendChild(footer);

        // --- Window ---
        const dialogWindow = new ManagedWindow({
            id: 'about-dialog',
            title: `About ${name}`,
            icon: 'info',
            content: contentEl,
            minWidth: 420,
            minHeight: 400,
            defaultWidth: 460,
            defaultHeight: 540,
            canMinimize: false,
            canMaximize: false,
            canResize: false,
            canDrag: false,
            modal: true,
            onClose: () => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            },
        });

        dialogWindow.show();

        requestAnimationFrame(() => {
            closeBtn.focus();
        });
    });
}
