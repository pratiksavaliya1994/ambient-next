import "server-only"

import { StyleSheet } from "@react-pdf/renderer"

/**
 * Shared styling for the run-sheet PDF, kept in one place because every stop
 * card and the header draw from the same rail-and-card layout the on-screen
 * run sheet uses — a numbered marker on the left, content to its right.
 */
export const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#111111" },

  headerTitle: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  headerMeta: { fontSize: 10, color: "#555555", marginBottom: 8 },
  notes: {
    fontSize: 9,
    backgroundColor: "#f4f4f4",
    padding: 8,
    borderRadius: 4,
    marginBottom: 14,
  },

  stopRow: { flexDirection: "row", marginBottom: 14 },
  stopRail: { width: 28, alignItems: "center" },
  stopBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: "#333333",
    alignItems: "center",
    justifyContent: "center",
  },
  stopBadgeText: { fontSize: 9, fontWeight: 700 },
  stopCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 6,
    padding: 10,
  },

  stopTime: { fontSize: 9, color: "#555555" },
  stopLocation: { fontSize: 12, fontWeight: 700, marginTop: 1 },
  stopKind: { fontSize: 8, color: "#777777", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },

  contactBlock: { marginTop: 4, marginBottom: 6, paddingLeft: 2 },
  contactLine: { fontSize: 9, color: "#333333" },

  section: { marginTop: 6 },
  sectionHeader: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  itemLine: { flexDirection: "row", fontSize: 9.5, paddingVertical: 1.5 },
  itemName: { fontWeight: 700 },
  itemDetail: { color: "#666666" },
  emptyStop: { fontSize: 9, color: "#888888" },
})
