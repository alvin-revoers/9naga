"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { marked } from "marked";
import { SegmentedControl } from "@/shared/components";

marked.setOptions({ gfm: true, breaks: true });

const DECOLUA_URL = "https://raw.githubusercontent.com/decolua/9router/refs/heads/master/CHANGELOG.md";
const SERENHOPE_URL = "https://raw.githubusercontent.com/serenhope/9router/refs/heads/master/CHANGELOG.md";

export default function ChangelogModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("serenhope"); // "serenhope" | "decolua"
  const [decoluaHtml, setDecoluaHtml] = useState("");
  const [serenhopeHtml, setSerenhopeHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError("");

    Promise.all([
      fetch(DECOLUA_URL).then(r => r.text()).catch(() => ""),
      fetch(SERENHOPE_URL).then(r => r.text()).catch(() => ""),
    ]).then(([decoluaMd, serenhopeMd]) => {
      if (decoluaMd) setDecoluaHtml(marked.parse(decoluaMd));
      if (serenhopeMd) setSerenhopeHtml(marked.parse(serenhopeMd));
    }).catch(err => {
      setError(err.message || "Failed to load changelog");
    }).finally(() => {
      setLoading(false);
    });
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const currentHtml = activeTab === "decolua" ? decoluaHtml : serenhopeHtml;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        className="relative w-full bg-surface border border-black/10 dark:border-white/10 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-w-3xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-black/5 dark:border-white/5">
          <h2 className="text-lg font-semibold text-text-main">Change Log</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="px-4 pt-3">
          <SegmentedControl
            options={[
              { value: "serenhope", label: "Updated by Serenhope" },
              { value: "decolua", label: "Updated by Decolua" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            fullWidth
          />
        </div>

        <div className="p-6 overflow-y-auto flex-1 prose dark:prose-invert max-w-none text-sm">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
            </div>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : currentHtml ? (
            <div dangerouslySetInnerHTML={{ __html: currentHtml }} />
          ) : (
            <p className="text-text-muted">No changelog available.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

ChangelogModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
