import { useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  toast,
} from "@dicoogle/dicoogle-next-webapp";
import { getViewerUrlTemplate, setViewerUrlTemplate } from "./settings";

const EXAMPLE = "https://viewer.example.org/viewer?StudyInstanceUIDs={StudyInstanceUID}";

export function StudyToolsSettings() {
  const [template, setTemplate] = useState(getViewerUrlTemplate);

  const save = () => {
    setViewerUrlTemplate(template);
    toast.success(template.trim() ? "Viewer URL saved" : "Viewer URL removed");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>External viewer</CardTitle>
        <CardDescription>
          Adds &quot;Open in external viewer&quot; to each search result. Use{" "}
          <code>{"{StudyInstanceUID}"}</code> where the study goes. Stored in this browser
          through the plugin&apos;s storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={template}
          placeholder={EXAMPLE}
          onChange={(event) => setTemplate(event.target.value)}
        />
        <div className="flex gap-2">
          <Button onClick={save}>Save</Button>
          <Button variant="outline-solid" onClick={() => setTemplate(EXAMPLE)}>
            Use example
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
