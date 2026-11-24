"use client";

import { useState } from "react";
import { LocalizedText } from "../../LocalizedText";
import { Drawer, Modal, Panel, Toast } from "../../ui";
import { MODAL_SIZES } from "./config/design-system.constants";
import type { ModalSize } from "./types/design-system.types";

export function OverlayDemo() {
  const [modal, setModal] = useState<ModalSize | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(false);

  return (
    <Panel title="DS.overlays" subtitle="DS.overlaysNote">
      <div className="ds-row">
        {MODAL_SIZES.map((size) => (
          <button key={size} type="button" className="btn default" onClick={() => setModal(size)}>
            Modal {size}
          </button>
        ))}
        <button type="button" className="btn default" onClick={() => setDrawer(true)}>
          Drawer
        </button>
        <button type="button" className="btn default" onClick={() => setToast(true)}>
          Toast
        </button>
      </div>
      {modal ? (
        <Modal
          title="DS.sampleDialog"
          subtitle={`size="${modal}"`}
          size={modal}
          onClose={() => setModal(null)}
          footer={
            <button type="button" className="btn primary" onClick={() => setModal(null)}>
              <LocalizedText text={"Close"} />
            </button>
          }
        >
          <p>
            <LocalizedText text={"DS.sampleBody"} />
          </p>
        </Modal>
      ) : null}
      {drawer ? (
        <Drawer title="DS.sampleDrawer" onClose={() => setDrawer(false)}>
          <p>
            <LocalizedText text={"DS.sampleBody"} />
          </p>
        </Drawer>
      ) : null}
      {toast ? <Toast message="DS.sampleToast" onDone={() => setToast(false)} /> : null}
    </Panel>
  );
}
