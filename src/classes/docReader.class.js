class DocReader {
    constructor(opts) {
        const modalElementId = "modal_" + opts.modalId;
        const path = opts.path;
        const scale = 1;
        const canvas = document.getElementById(modalElementId).querySelector(".pdf_canvas");
        const context = canvas.getContext('2d');
        let pdfDoc = null,
            pageNum = 1,
            pageRendering = false,
            pageNumPending = null,
            zoom = 100;

        const {pathToFileURL} = require("url");
        const pdfDocument = import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href)
            .then(pdfjsLib => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
                return pdfjsLib.getDocument({
                    url: pathToFileURL(path).href,
                    isEvalSupported: false
                }).promise;
            });

        this.renderPage = (num) => {
            pageRendering = true;
            pdfDocument.then(pdf => {
                pdf.getPage(num).then(page => {
                    const viewport = page.getViewport({ scale: scale });
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport,
                    };
                    const renderTask = page.render(renderContext);
                    renderTask.promise.then(() => {
                        pageRendering = false;
                        if (pageNumPending !== null) {
                            this.renderPage(pageNumPending);
                            pageNumPending = null;
                        }
                    });
                });
            });
            document.getElementById(modalElementId).querySelector(".page_num").textContent = num;
        };

        this.queueRenderPage = (num) => {
            if (pageRendering) {
                pageNumPending = num;
            } else {
                this.renderPage(num);
            }
        };

        this.onPrevPage = () => {
            if (pageNum <= 1) {
                return;
            }
            pageNum--;
            this.queueRenderPage(pageNum);
        };

        this.onNextPage = () => {
            if (pageNum >= pdfDoc.numPages) {
                return;
            }
            pageNum++;
            this.queueRenderPage(pageNum);
        };

        this.zoomIn = () => {
            if (zoom >= 200) {
                return;
            }
            zoom = zoom + 10;
            canvas.style.zoom = zoom + "%";
        };

        this.zoomOut = () => {
            if (zoom <= 50) {
                return;
            }
            zoom = zoom - 10;
            canvas.style.zoom = zoom + "%";
        };

        document.getElementById(modalElementId).querySelector(".previous_page").addEventListener('click', this.onPrevPage);
        document.getElementById(modalElementId).querySelector(".next_page").addEventListener('click', this.onNextPage);
        document.getElementById(modalElementId).querySelector(".zoom_in").addEventListener('click', this.zoomIn);
        document.getElementById(modalElementId).querySelector(".zoom_out").addEventListener('click', this.zoomOut);

        pdfDocument.then((pdfDoc_) => {
            pdfDoc = pdfDoc_;
            document.getElementById(modalElementId).querySelector(".page_count").textContent = pdfDoc.numPages;
            this.renderPage(pageNum);
        });
    }
}

module.exports = {
    DocReader
};
