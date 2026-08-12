import { useState } from "react";
import JSZip from "jszip";

type FitMode = "contain" | "cover";
type Rotation = 0 | 90 | 180 | 270;

type PageData = {
  page: number;
  number: number | null;
  summary: string;
  author: string;
  mangaPage: string;
  spreadSide: "左" | "右";
  sheetNumber: string;
  fileName: string;
  imageUrl: string;
  rotation: Rotation;
  fitMode: FitMode;
  showNomburu: boolean;
  isBlank: boolean;
};

type FillField = "mangaPage" | "summary" | "author";

type SaveData = {
  pageCount: number;
  pages: PageData[];
};

function App() {
  const [pageCount, setPageCount] = useState(24);
  const [pages, setPages] = useState<PageData[]>([]);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [readerStep, setReaderStep] = useState(0);

  const [fillStart, setFillStart] = useState<{
    page: number;
    field: FillField;
  } | null>(null);

  const [fillEndPage, setFillEndPage] = useState<number | null>(null);

  function getDefaultSummary(page: number, totalPages: number) {
    if (page === 1) return "表紙1（表表紙）";
    if (page === 2) return "表紙2";
    if (page === 3) return "中表紙";
    if (page === 4) return "目次";
    if (page === totalPages - 3) return "作者の一言";
    if (page === totalPages - 2) return "編集後記＆奥付";
    if (page === totalPages - 1) return "表紙3";
    if (page === totalPages) return "表紙4（裏表紙）";
    return "";
  }

  function getNomburu(page: number, totalPages: number) {
    if (page < 3) return null;
    if (page > totalPages - 2) return null;
    return page - 2;
  }

  function getSpreadSide(page: number): "左" | "右" {
    return page % 2 === 1 ? "左" : "右";
  }

  function getSheetNumber(page: number, totalPages: number) {
    const mirrorPage = Math.min(page, totalPages - page + 1);
    const sheet = Math.ceil(mirrorPage / 2);
    const side = mirrorPage % 2 === 1 ? 1 : 2;
    return `${sheet}-${side}`;
  }

  function createPages() {
    if (pageCount % 4 !== 0) {
      alert("中綴じ冊子は4の倍数ページにしてください。");
      return;
    }

    const newPages = Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1;

      return {
        page,
        number: getNomburu(page, pageCount),
        summary: getDefaultSummary(page, pageCount),
        author: "",
        mangaPage: "",
        spreadSide: getSpreadSide(page),
        sheetNumber: getSheetNumber(page, pageCount),
        fileName: "",
        imageUrl: "",
        rotation: 0 as Rotation,
        fitMode: "contain" as FitMode,
        showNomburu: true,
        isBlank: false,
      };
    });

    setPages(newPages);
    setSelectedPage(1);
    setReaderStep(0);
  }

  function updatePage(page: number, field: FillField, value: string) {
    setPages((currentPages) =>
      currentPages.map((p) =>
        p.page === page ? { ...p, [field]: value } : p
      )
    );
  }

  function updatePageOption(page: number, changes: Partial<PageData>) {
    setPages((currentPages) =>
      currentPages.map((p) =>
        p.page === page ? { ...p, ...changes } : p
      )
    );
  }

  function uploadImage(page: number, file: File | null) {
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);

    updatePageOption(page, {
      fileName: file.name,
      imageUrl,
      isBlank: false,
    });

    setSelectedPage(page);
  }

  function removeImage(page: number) {
    const target = pages.find((p) => p.page === page);

    if (target?.imageUrl) {
      URL.revokeObjectURL(target.imageUrl);
    }

    updatePageOption(page, {
      fileName: "",
      imageUrl: "",
    });
  }

  function startFill(page: number, field: FillField) {
    setFillStart({ page, field });
    setFillEndPage(page);
  }

  function hoverFill(page: number) {
    if (!fillStart) return;
    setFillEndPage(page);
  }

  function toHalfWidthNumberText(text: string) {
    return text.replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    );
  }

  function finishFill() {
    if (!fillStart || fillEndPage === null) return;

    const startPage = fillStart.page;
    const endPage = fillEndPage;
    const field = fillStart.field;

    const from = Math.min(startPage, endPage);
    const to = Math.max(startPage, endPage);

    const startRow = pages.find((p) => p.page === startPage);
    if (!startRow) return;

    const startValue = startRow[field];

    setPages((currentPages) =>
      currentPages.map((p) => {
        if (p.page < from || p.page > to) return p;

        if (field === "mangaPage") {
          const numericValue = Number(toHalfWidthNumberText(startValue));

          if (!Number.isNaN(numericValue) && startValue !== "") {
            return {
              ...p,
              mangaPage: String(numericValue + (p.page - startPage)),
            };
          }
        }

        return {
          ...p,
          [field]: startValue,
        };
      })
    );

    setFillStart(null);
    setFillEndPage(null);
  }

  function isInFillRange(page: number, field: FillField) {
    if (!fillStart || fillEndPage === null) return false;
    if (fillStart.field !== field) return false;

    const from = Math.min(fillStart.page, fillEndPage);
    const to = Math.max(fillStart.page, fillEndPage);

    return page >= from && page <= to;
  }

  function saveProject() {
    const data: SaveData = {
      pageCount,
      pages,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "bushi-project.json";
    link.click();

    URL.revokeObjectURL(url);
  }

  function loadProject(file: File | null) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = String(reader.result);
        const data = JSON.parse(text) as SaveData;

        const fixedPages = data.pages.map((p) => ({
          ...p,
          isBlank: p.isBlank ?? false,
          showNomburu: p.showNomburu ?? true,
        }));

        setPageCount(data.pageCount);
        setPages(fixedPages);
        setSelectedPage(fixedPages[0]?.page ?? null);
        setReaderStep(0);
      } catch {
        alert("読み込みに失敗しました。保存したJSONファイルを選んでください。");
      }
    };

    reader.readAsText(file);
  }

  function renderEditableCell(
    page: number,
    field: FillField,
    value: string,
    width: string,
    placeholder: string
  ) {
    return (
      <div
        onMouseEnter={() => hoverFill(page)}
        style={{
          position: "relative",
          backgroundColor: isInFillRange(page, field) ? "#dff0ff" : "white",
          padding: "2px",
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) =>
            updatePage(page, field, e.target.value)
          }
          placeholder={placeholder}
          style={{
            fontSize: "16px",
            width,
            boxSizing: "border-box",
            padding: "4px",
          }}
        />

        <div
          onMouseDown={(e) => {
            e.preventDefault();
            startFill(page, field);
          }}
          onMouseUp={finishFill}
          style={{
            position: "absolute",
            right: "1px",
            bottom: "1px",
            width: "9px",
            height: "9px",
            backgroundColor: "black",
            cursor: "crosshair",
          }}
          title="フィルハンドル"
        />
      </div>
    );
  }

  function PagePreview({
    pageData,
    width = 260,
    height = 368,
    displaySide = "single",
  }: {
    pageData: PageData | null;
    width?: number;
    height?: number;
    displaySide?: "left" | "right" | "single";
  }) {
    if (!pageData) {
      return (
        <div
          style={{
            width,
            height,
            border: "2px solid #333",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#888",
            background: "white",
          }}
        >
          ページなし
        </div>
      );
    }

    const nomburuPosition =
      displaySide === "left"
        ? { left: "10px" }
        : displaySide === "right"
        ? { right: "10px" }
        : pageData.spreadSide === "左"
        ? { left: "10px" }
        : { right: "10px" };

    return (
      <div
        style={{
          width,
          height,
          border: "2px solid #333",
          backgroundColor: "white",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        {pageData.isBlank ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "white",
            }}
          />
        ) : pageData.imageUrl ? (
          <img
            src={pageData.imageUrl}
            alt={pageData.fileName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: pageData.fitMode,
              transform: `rotate(${pageData.rotation}deg)`,
            }}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
              textAlign: "center",
              padding: "16px",
              boxSizing: "border-box",
            }}
          >
            画像未登録
          </div>
        )}

        {pageData.number !== null && pageData.showNomburu && (
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              ...nomburuPosition,
              fontSize: "10px",
              fontWeight: "bold",
              color: "black",
              textShadow:
                "1px 0 white, -1px 0 white, 0 1px white, 0 -1px white",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {pageData.number}
          </div>
        )}
      </div>
    );
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function renderPageToCanvas(pageData: PageData) {
    const pageW = 1000;
    const pageH = 1414;

    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvasを作成できませんでした");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, pageW, pageH);

    if (!pageData.isBlank && pageData.imageUrl) {
      const img = await loadImage(pageData.imageUrl);

      ctx.save();
      ctx.translate(pageW / 2, pageH / 2);
      ctx.rotate((pageData.rotation * Math.PI) / 180);

      const rotated =
        pageData.rotation === 90 || pageData.rotation === 270;

      const drawAreaW = rotated ? pageH : pageW;
      const drawAreaH = rotated ? pageW : pageH;

      const scale =
        pageData.fitMode === "cover"
          ? Math.max(
              drawAreaW / img.width,
              drawAreaH / img.height
            )
          : Math.min(
              drawAreaW / img.width,
              drawAreaH / img.height
            );

      const drawW = img.width * scale;
      const drawH = img.height * scale;

      ctx.drawImage(
        img,
        -drawW / 2,
        -drawH / 2,
        drawW,
        drawH
      );

      ctx.restore();
    }

    if (pageData.number !== null && pageData.showNomburu) {
      const text = String(pageData.number);

      const x =
        pageData.spreadSide === "左"
          ? 60
          : pageW - 60;

      const y = pageH - 40;

      ctx.font = "bold 32px sans-serif";
      ctx.textBaseline = "bottom";
      ctx.textAlign =
        pageData.spreadSide === "左"
          ? "left"
          : "right";

      ctx.lineWidth = 8;
      ctx.strokeStyle = "white";
      ctx.strokeText(text, x, y);

      ctx.fillStyle = "black";
      ctx.fillText(text, x, y);
    }

    return canvas;
  }

  async function exportPrintSheets() {
    if (pages.length === 0) {
      alert("ページ表を作成してください。");
      return;
    }

    const missingImages = pages.filter(
      (p) => !p.imageUrl && !p.isBlank
    );

    if (missingImages.length > 0) {
      const ok = confirm(
        `画像未登録かつ白紙指定されていないページが ${missingImages.length} ページあります。そのまま出力しますか？`
      );

      if (!ok) return;
    }

    const zip = new JSZip();
    const groups = new Map<string, PageData[]>();

    for (const page of pages) {
      if (!groups.has(page.sheetNumber)) {
        groups.set(page.sheetNumber, []);
      }

      groups.get(page.sheetNumber)?.push(page);
    }

    for (const [sheetNumber, sheetPages] of groups) {
      if (sheetPages.length !== 2) continue;

      const sortedPages = [...sheetPages].sort(
        (a, b) => a.page - b.page
      );

      let leftPage: PageData;
      let rightPage: PageData;

      if (sheetNumber.endsWith("-1")) {
        leftPage = sortedPages[0];
        rightPage = sortedPages[1];
      } else {
        leftPage = sortedPages[1];
        rightPage = sortedPages[0];
      }

      const leftCanvas =
        await renderPageToCanvas(leftPage);

      const rightCanvas =
        await renderPageToCanvas(rightPage);

      const sheetCanvas =
        document.createElement("canvas");

      sheetCanvas.width =
        leftCanvas.width + rightCanvas.width;

      sheetCanvas.height =
        leftCanvas.height;

      const ctx =
        sheetCanvas.getContext("2d");

      if (!ctx) continue;

      ctx.fillStyle = "white";

      ctx.fillRect(
        0,
        0,
        sheetCanvas.width,
        sheetCanvas.height
      );

      ctx.drawImage(
        leftCanvas,
        0,
        0
      );

      ctx.drawImage(
        rightCanvas,
        leftCanvas.width,
        0
      );

      if (sheetNumber === "1-1") {
        const centerX = leftCanvas.width;

        ctx.strokeStyle = "black";
        ctx.lineWidth = 6;

        const markLength = 90;
        const markOffset = 260;

        ctx.beginPath();

        ctx.moveTo(
          centerX,
          markOffset
        );

        ctx.lineTo(
          centerX,
          markOffset + markLength
        );

        ctx.stroke();

        ctx.beginPath();

        ctx.moveTo(
          centerX,
          sheetCanvas.height -
            markOffset -
            markLength
        );

        ctx.lineTo(
          centerX,
          sheetCanvas.height -
            markOffset
        );

        ctx.stroke();
      }

      await new Promise<void>((resolve) => {
        sheetCanvas.toBlob((blob) => {
          if (blob) {
            zip.file(
              `${sheetNumber}.png`,
              blob
            );
          }

          resolve();
        }, "image/png");
      });
    }

    const zipBlob =
      await zip.generateAsync({
        type: "blob",
      });

    const url =
      URL.createObjectURL(zipBlob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download = "print-sheets.zip";

    link.click();

    URL.revokeObjectURL(url);
  }

  const selectedPageData =
    pages.find(
      (p) => p.page === selectedPage
    ) ??
    pages[0] ??
    null;

  let readerLeftPage: PageData | null = null;
  let readerRightPage: PageData | null = null;

  const maxReaderStep =
    Math.ceil(pageCount / 2);

  if (readerStep === 0) {
    readerLeftPage =
      pages.find((p) => p.page === 1) ??
      null;

    readerRightPage = null;
  } else if (readerStep === 1) {
    readerLeftPage =
      pages.find((p) => p.page === 3) ??
      null;

    readerRightPage =
      pages.find((p) => p.page === 2) ??
      null;
  } else if (readerStep === maxReaderStep) {
    readerLeftPage = null;

    readerRightPage =
      pages.find(
        (p) => p.page === pageCount
      ) ?? null;
  } else {
    const rightPageNumber =
      readerStep * 2;

    const leftPageNumber =
      rightPageNumber + 1;

    readerLeftPage =
      pages.find(
        (p) => p.page === leftPageNumber
      ) ?? null;

    readerRightPage =
      pages.find(
        (p) => p.page === rightPageNumber
      ) ?? null;
  }

  return (
    <div
      onMouseUp={finishFill}
      style={{
        padding: "20px",
        fontFamily: "sans-serif",
      }}
    >
      <h1>部誌編集ソフト</h1>

      <div
        style={{
          backgroundColor: "#eef6ff",
          border: "1px solid #99c2ff",
          padding: "16px",
          marginBottom: "20px",
          color: "#222",
        }}
      >
        <h2 style={{ color: "#222" }}>
          使い方
        </h2>

        <ol>
          <li>
            <b>総ページ数</b>
            を入力します。中綴じ冊子は4の倍数にしてください。
          </li>

          <li>
            <b>ページ表を作成</b>
            を押すと、ページ一覧が自動生成されます。
          </li>

          <li>
            概要・作者・漫画ページを入力します。
          </li>

          <li>
            セル右下の黒い■をドラッグすると、
            漫画ページは連番、概要・作者はコピーできます。
          </li>

          <li>
            行をクリックすると、右側のページ設定とプレビューが切り替わります。
          </li>

          <li>
            原稿画像・回転・配置・ノンブル表示・白紙指定を設定できます。
          </li>

          <li>
            電子版完成プレビューで冊子の完成イメージを確認できます。
          </li>

          <li>
            印刷面PNGを書き出すと、同じ面番号のページを横長PNGとしてZIP出力します。
          </li>
        </ol>

        <h3>用語説明</h3>

        <ul>
          <li>
            <b>実ページ：</b>
            表紙1を1ページ目として数えた冊子全体のページ番号です。
          </li>

          <li>
            <b>ノンブル：</b>
            紙面に印刷されるページ番号です。中表紙が1になります。
          </li>

          <li>
            <b>面番号：</b>
            中綴じ印刷時に同じ印刷面になるページの組み合わせ番号です。
          </li>

          <li>
            <b>見開き左右：</b>
            冊子を開いた時のページ位置です。
          </li>
        </ul>
      </div>

      <div
        style={{
          marginBottom: "20px",
        }}
      >
        <button
          onClick={saveProject}
          style={{
            fontSize: "16px",
          }}
        >
          保存
        </button>

        <label
          style={{
            marginLeft: "12px",
            fontSize: "16px",
          }}
        >
          読み込み：
          <input
            type="file"
            accept="application/json"
            onChange={(e) =>
              loadProject(
                e.target.files?.[0] ??
                  null
              )
            }
            style={{
              marginLeft: "8px",
            }}
          />
        </label>

        <button
          onClick={exportPrintSheets}
          style={{
            fontSize: "16px",
            marginLeft: "12px",
          }}
        >
          印刷面PNGを書き出し
        </button>
      </div>

      <div
        style={{
          marginBottom: "12px",
        }}
      >
        <p>総ページ数</p>

        <input
          type="number"
          value={pageCount}
          onChange={(e) =>
            setPageCount(
              Number(e.target.value)
            )
          }
          style={{
            fontSize: "20px",
            width: "100px",
          }}
        />

        <button
          onClick={createPages}
          style={{
            marginLeft: "8px",
            fontSize: "18px",
          }}
        >
          ページ表を作成
        </button>
      </div>

      <p>
        現在のページ数: {pageCount}
      </p>

      {pageCount % 4 !== 0 && (
        <p style={{ color: "red" }}>
          エラー：中綴じ冊子は4の倍数ページである必要があります
        </p>
      )}

      <p>
        ノンブル範囲：実ページ3〜
        {pageCount - 2}
        {" / "}
        最終ノンブル：
        {pageCount - 4}
      </p>

      <div
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            overflowX: "auto",
            maxWidth: "72vw",
          }}
        >
          <h2>ページ一覧</h2>

          <table
            border={1}
            cellPadding={8}
            style={{
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th>実ページ</th>
                <th>ノンブル</th>
                <th>面番号</th>
                <th>見開き左右</th>
                <th>漫画ページ</th>
                <th>概要</th>
                <th>作者</th>
              </tr>
            </thead>

            <tbody>
              {pages.map((p) => (
                <tr
                  key={p.page}
                  onClick={() =>
                    setSelectedPage(
                      p.page
                    )
                  }
                  style={{
                    backgroundColor:
                      selectedPage ===
                      p.page
                        ? "#fff3c4"
                        : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td>{p.page}</td>

                  <td>
                    {p.number !== null
                      ? p.number
                      : "—"}
                  </td>

                  <td>
                    {p.sheetNumber}
                  </td>

                  <td>
                    {p.spreadSide}
                  </td>

                  <td>
                    {renderEditableCell(
                      p.page,
                      "mangaPage",
                      p.mangaPage,
                      "80px",
                      "例：1"
                    )}
                  </td>

                  <td>
                    {renderEditableCell(
                      p.page,
                      "summary",
                      p.summary,
                      "280px",
                      "例：漫画本編"
                    )}
                  </td>

                  <td>
                    {renderEditableCell(
                      p.page,
                      "author",
                      p.author,
                      "160px",
                      "作者名"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            position: "sticky",
            top: "20px",
            width: "300px",
          }}
        >
          <h2>ページ設定</h2>

          {selectedPageData ? (
            <div
              style={{
                border:
                  "1px solid #ccc",
                padding: "12px",
                marginBottom: "16px",
                background: "#f8f8f8",
              }}
            >
              <p>
                選択中：実ページ{" "}
                {selectedPageData.page}
                <br />
                {selectedPageData.summary ||
                  "概要なし"}
              </p>

              <div
                style={{
                  marginBottom: "12px",
                }}
              >
                <p>原稿ファイル</p>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    uploadImage(
                      selectedPageData.page,
                      e.target.files?.[0] ??
                        null
                    )
                  }
                />

                {selectedPageData.fileName && (
                  <>
                    <div
                      style={{
                        fontSize: "12px",
                        marginTop: "4px",
                      }}
                    >
                      {
                        selectedPageData.fileName
                      }
                    </div>

                    <button
                      onClick={() =>
                        removeImage(
                          selectedPageData.page
                        )
                      }
                      style={{
                        marginTop: "8px",
                      }}
                    >
                      選択ファイルを削除
                    </button>
                  </>
                )}
              </div>

              <div
                style={{
                  marginBottom: "12px",
                }}
              >
                <p>回転</p>

                <select
                  value={
                    selectedPageData.rotation
                  }
                  onChange={(e) =>
                    updatePageOption(
                      selectedPageData.page,
                      {
                        rotation:
                          Number(
                            e.target.value
                          ) as Rotation,
                      }
                    )
                  }
                >
                  <option value={0}>
                    0°
                  </option>

                  <option value={90}>
                    90°
                  </option>

                  <option value={180}>
                    180°
                  </option>

                  <option value={270}>
                    270°
                  </option>
                </select>
              </div>

              <div
                style={{
                  marginBottom: "12px",
                }}
              >
                <p>配置</p>

                <select
                  value={
                    selectedPageData.fitMode
                  }
                  onChange={(e) =>
                    updatePageOption(
                      selectedPageData.page,
                      {
                        fitMode:
                          e.target
                            .value as FitMode,
                      }
                    )
                  }
                >
                  <option value="contain">
                    全体表示
                  </option>

                  <option value="cover">
                    余白なし
                  </option>
                </select>
              </div>

              <div
                style={{
                  marginBottom: "8px",
                }}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={
                      selectedPageData.showNomburu
                    }
                    onChange={(e) =>
                      updatePageOption(
                        selectedPageData.page,
                        {
                          showNomburu:
                            e.target.checked,
                        }
                      )
                    }
                  />
                  ノンブルを表示
                </label>
              </div>

              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={
                      selectedPageData.isBlank
                    }
                    onChange={(e) =>
                      updatePageOption(
                        selectedPageData.page,
                        {
                          isBlank:
                            e.target.checked,
                        }
                      )
                    }
                  />
                  このページを白紙にする
                </label>
              </div>
            </div>
          ) : (
            <p>
              ページ表を作成してください。
            </p>
          )}

          <h2>紙面プレビュー</h2>

          <PagePreview
            pageData={
              selectedPageData
            }
          />
        </div>
      </div>

      <hr
        style={{
          margin: "32px 0",
        }}
      />

      <h2>
        電子版完成プレビュー
      </h2>

      {pages.length > 0 ? (
        <div>
          <div
            style={{
              marginBottom: "12px",
            }}
          >
            <button
              onClick={() =>
                setReaderStep(
                  Math.min(
                    maxReaderStep,
                    readerStep + 1
                  )
                )
              }
              disabled={
                readerStep >=
                maxReaderStep
              }
            >
              次の見開き
            </button>

            <span
              style={{
                margin: "0 12px",
              }}
            >
              {readerStep === 0
                ? "表紙"
                : readerStep === 1
                ? "中表紙 / 表紙2"
                : readerStep ===
                  maxReaderStep
                ? "裏表紙"
                : `実ページ ${
                    readerStep * 2 +
                    1
                  } - ${
                    readerStep * 2
                  }`}
            </span>

            <button
              onClick={() =>
                setReaderStep(
                  Math.max(
                    0,
                    readerStep - 1
                  )
                )
              }
              disabled={
                readerStep <= 0
              }
            >
              前の見開き
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              background: "#ddd",
              padding: "16px",
              width: "fit-content",
            }}
          >
            <PagePreview
              pageData={
                readerLeftPage
              }
              width={220}
              height={312}
              displaySide="left"
            />

            <PagePreview
              pageData={
                readerRightPage
              }
              width={220}
              height={312}
              displaySide="right"
            />
          </div>
        </div>
      ) : (
        <p>
          ページ表を作成してください。
        </p>
      )}
            <footer
        style={{
          marginTop: "48px",
          paddingTop: "20px",
          paddingBottom: "24px",
          borderTop: "1px solid #ccc",
          textAlign: "center",
          fontSize: "14px",
          color: "#666",
        }}
      >
        制作：徳島大学まんが部　第43代部長　鈴木皐
      </footer>
    </div>
  );
}

export default App;