import { StyleSheet } from "@react-pdf/renderer";

export const C = {
  dark: "#111827",
  gray: "#6b7280",
  grayLight: "#f3f4f6",
  grayBorder: "#e5e7eb",
  white: "#ffffff",
  orange: "#f97316",
  orangeDark: "#c2410c",
  orangeLight: "#ffedd5",
  green: "#10b981",
  greenDark: "#047857",
  greenLight: "#d1fae5",
  red: "#ef4444",
  blue: "#1e40af",
};

export const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    color: C.dark,
    fontFamily: "Helvetica",
    backgroundColor: C.white,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: C.orange,
    paddingBottom: 8,
    marginBottom: 12,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.orangeDark,
  },
  headerSubtitle: { fontSize: 9, color: C.gray, marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  brandName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.greenDark,
  },
  brandInfo: { fontSize: 7, color: C.gray, textAlign: "right" },

  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    backgroundColor: C.orangeDark,
    padding: 5,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gridRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  infoBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.grayBorder,
    borderRadius: 3,
    padding: 6,
  },
  infoLabel: {
    fontSize: 7,
    color: C.gray,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    marginTop: 2,
  },

  table: { borderWidth: 1, borderColor: C.grayBorder, borderRadius: 3 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.grayLight,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  tableHeadCell: {
    padding: 5,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
  },
  tableRowLast: { flexDirection: "row" },
  tableCell: { padding: 5, fontSize: 9, color: C.dark },
  tableCellMono: {
    padding: 5,
    fontSize: 9,
    color: C.dark,
    fontFamily: "Courier",
  },

  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.grayBorder,
    gap: 6,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: C.dark,
    borderRadius: 2,
  },
  checklistText: { fontSize: 9, color: C.dark, flex: 1 },

  signatureBlock: {
    marginTop: 30,
    flexDirection: "row",
    gap: 20,
  },
  signatureCol: { flex: 1, alignItems: "center" },
  signatureLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: C.dark,
    marginBottom: 4,
  },
  signatureLabel: { fontSize: 8, color: C.gray },

  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 7,
    color: C.gray,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: C.grayBorder,
    paddingTop: 4,
  },
});

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
