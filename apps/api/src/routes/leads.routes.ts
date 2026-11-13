import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { Role, LeadStatus, PropertyType } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { leadSchema, leadUpdateSchema, paginationSchema } from "../validators";
import * as leadService from "../services/lead.service";
import { AppError } from "../utils/errors";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = Router();

router.use(authenticate);

router.get(
  "/",
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    const result = await leadService.listLeads({
      search: req.query.search as string | undefined,
      status: req.query.status as LeadStatus | undefined,
      source: req.query.source as string | undefined,
      propertyType: req.query.propertyType as PropertyType | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data: result });
  })
);

router.post(
  "/",
  authorize(Role.ADMIN, Role.MANAGER, Role.AGENT),
  validate(leadSchema),
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if (body.email === "") delete body.email;
    const lead = await leadService.createLead(body);
    res.status(201).json({ success: true, data: lead });
  })
);

router.post(
  "/import",
  authorize(Role.ADMIN, Role.MANAGER, Role.AGENT),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError("File is required", 400);

    const filename = req.file.originalname.toLowerCase();
    let rows: Array<Record<string, unknown>> = [];

    if (filename.endsWith(".csv")) {
      rows = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, unknown>>;
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet) as Array<Record<string, unknown>>;
    } else {
      throw new AppError("Only CSV or Excel files are supported", 400);
    }

    const normalized = rows.map((row) => ({
      name: String(row.name || row.Name || ""),
      phone: String(row.phone || row.Phone || ""),
      email: row.email || row.Email ? String(row.email || row.Email) : undefined,
      propertyType: row.propertyType || row.PropertyType
        ? String(row.propertyType || row.PropertyType)
        : undefined,
      preferredLocation: row.preferredLocation || row.location
        ? String(row.preferredLocation || row.location)
        : undefined,
      budgetMin: row.budgetMin != null ? Number(row.budgetMin) : undefined,
      budgetMax: row.budgetMax != null ? Number(row.budgetMax) : undefined,
      purchasePreference: row.purchasePreference
        ? String(row.purchasePreference)
        : undefined,
      source: row.source ? String(row.source) : "import",
      status: row.status ? String(row.status) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
    }));

    const result = await leadService.importLeads(normalized);
    res.json({ success: true, data: result });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const lead = await leadService.getLeadById(req.params.id);
    res.json({ success: true, data: lead });
  })
);

router.patch(
  "/:id",
  authorize(Role.ADMIN, Role.MANAGER, Role.AGENT),
  validate(leadUpdateSchema),
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    if (body.email === "") body.email = null;
    const lead = await leadService.updateLead(req.params.id, body);
    res.json({ success: true, data: lead });
  })
);

router.delete(
  "/:id",
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    const result = await leadService.deleteLead(req.params.id);
    res.json({ success: true, data: result });
  })
);

export default router;
