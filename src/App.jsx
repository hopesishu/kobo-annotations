import React, { useEffect, useState, useMemo } from "react";
import initSqlJs from "sql.js";
import {
  Container,
  Typography,
  Button,
  TextField,
  Paper,
  Box,
  CircularProgress,
  Divider
} from "@mui/material";

export default function App() {
  const [annotations, setAnnotations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("Default KoboReader.sqlite");

  const normalizeChapter = (contentID) => {
    if (!contentID) return "Highlights";
    const file = contentID.split("/").pop().split("#")[0].replace(/\.(kepub\.epub|x?html?|pdf|epub)$/i, '');
    const name = file.replace(/[_-]+/g, ' ').trim();

    const patterns = [
      { regex: /^part0*(\d+)/i, format: n => `Chapter ${n}` },
      { regex: /chapter0*(\d+)/i, format: n => `Chapter ${n}` },
      { regex: /c\s*(\d+)/i, format: n => `Chapter ${n}` },
      { regex: /ch\s*(\d+)/i, format: n => `Chapter ${n}` },
    ];

    for (const { regex, format } of patterns) {
      const match = name.match(regex);
      if (match) return format(parseInt(match[1], 10));
    }

    const words = name.match(/[A-Za-z]+/g);
    if (words) return words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");

    return "Highlights";
  };

  const handleFile = async (file) => {
    setLoading(true);
    setError("");
    setAnnotations([]);
    setFileName(file.name);

    try {
      const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });
      const buffer = await file.arrayBuffer();
      const db = new SQL.Database(new Uint8Array(buffer));

      const stmt = db.prepare(`
        SELECT 
          b.Text AS highlight,
          b.Annotation AS note,
          b.DateCreated,
          b.ContentID,
          book.Title AS bookTitle,
          book.ContentType AS bookType
        FROM Bookmark b
        JOIN content book
          ON b.VolumeID = book.ContentID
        WHERE b.Text IS NOT NULL
        ORDER BY book.Title, b.ContentID, b.DateCreated
      `);

      const rows = [];
      while (stmt.step()) {
        const r = stmt.getAsObject();
        rows.push({
          bookTitle: r.bookTitle,
          bookFormat: r.bookType === 6 ? "EPUB" : "PDF",
          chapterTitle: normalizeChapter(r.ContentID),
          highlight: r.highlight,
          note: r.note,
          date: r.DateCreated
        });
      }

      setAnnotations(rows);
      db.close();
    } catch (err) {
      console.error(err);
      setError("Failed to read SQLite file. Make sure it is valid.");
    } finally {
      setLoading(false);
    }
  };

  // Load default file on startup
  useEffect(() => {
    const basePath = import.meta.env.BASE_URL; 
    fetch(`${basePath}data/KoboReader.sqlite`)
      .then(res => res.blob())
      .then(blob => handleFile(new File([blob], "KoboReader.sqlite")))
      .catch(err => setError("Failed to load default SQLite file."));
  }, []);

  const filteredAnnotations = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return annotations.filter(a =>
      a.highlight.toLowerCase().includes(q) || (a.note && a.note.toLowerCase().includes(q))
    );
  }, [annotations, searchQuery]);

  const books = useMemo(() => {
    const grouped = {};
    filteredAnnotations.forEach(a => {
      const book = a.bookTitle || "Unknown Book";
      const chapter = a.chapterTitle || "Highlights";
      grouped[book] ??= {};
      grouped[book][chapter] ??= [];
      grouped[book][chapter].push(a);
    });
    return grouped;
  }, [filteredAnnotations]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h3" align="center" gutterBottom>
        Kobo Highlights
      </Typography>

      <Box display="flex" gap={2} flexWrap="wrap" mb={3}>
        <Button
          variant="contained"
          component="label"
          color="success"
        >
          {fileName ? `Loaded: ${fileName}` : "Upload SQLite"}
          <input
            type="file"
            accept=".sqlite"
            hidden
            onChange={(e) => {
              if (e.target.files.length > 0) handleFile(e.target.files[0]);
            }}
          />
        </Button>

        <TextField
          label="Search highlights or notes"
          variant="outlined"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
        />
      </Box>

      {loading && <CircularProgress sx={{ display: "block", mx: "auto", my: 3 }} />}
      {error && <Typography color="error">{error}</Typography>}

      {Object.entries(books).map(([bookTitle, chapters]) => (
        <Box key={bookTitle} mb={6}>
          <Typography variant="h5" gutterBottom>{bookTitle}</Typography>
          {Object.entries(chapters).map(([chapterTitle, anns]) => (
            <Box key={chapterTitle} mb={3} ml={2}>
              <Typography variant="subtitle1" gutterBottom color="textSecondary">{chapterTitle}</Typography>
              {anns.map((a, i) => (
                <Paper key={i} sx={{ p: 2, mb: 1, borderLeft: "5px solid #1976d2" }} elevation={1}>
                  <Typography>{a.highlight}</Typography>
                  {a.note && <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>📝 {a.note}</Typography>}
                </Paper>
              ))}
            </Box>
          ))}
          <Divider sx={{ my: 3 }} />
        </Box>
      ))}
    </Container>
  );
}
