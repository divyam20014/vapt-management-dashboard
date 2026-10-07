import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { projectService } from '../../services/projectService';
import { toApiError } from '../../services/api';
import { DEFAULT_PROJECT_STATUS, PROJECT_ENVIRONMENTS, PROJECT_STATUSES, type ProjectEnvironment, type ProjectStatus } from '../../utils/constants';
import type { Project, ProjectInput } from '../../types/project';

interface ProjectFormModalProps {
  open: boolean;
  project?: Project | null;
  onClose: () => void;
  onSaved: (project: Project) => void;
}

type Errors = Partial<Record<keyof ProjectInput, string>>;

const EMPTY_FORM: ProjectInput = {
  name: '',
  application_name: '',
  description: '',
  environment: '',
  application_url: '',
  owner: '',
  status: DEFAULT_PROJECT_STATUS,
};

function toForm(project?: Project | null): ProjectInput {
  if (!project) return EMPTY_FORM;
  return {
    name: project.name,
    application_name: project.application_name ?? '',
    description: project.description ?? '',
    environment: project.environment ?? '',
    application_url: project.application_url ?? '',
    owner: project.owner ?? '',
    status: project.status,
  };
}

function validate(form: ProjectInput): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Project name is required.';
  const url = form.application_url.trim();
  if (url && !/^https?:\/\//i.test(url)) errors.application_url = 'URL must start with http:// or https://';
  return errors;
}

export default function ProjectFormModal({ open, project, onClose, onSaved }: ProjectFormModalProps) {
  const isEdit = Boolean(project);
  const [form, setForm] = useState<ProjectInput>(() => toForm(project));
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(toForm(project));
      setErrors({});
      setSubmitError(null);
    }
  }, [open, project]);

  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const clientErrors = validate(form);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      const saved = isEdit && project ? await projectService.update(project.id, form) : await projectService.create(form);
      onSaved(saved);
    } catch (err) {
      const apiError = toApiError(err);
      const fieldErrors: Errors = {};
      for (const fieldError of apiError.fieldErrors) {
        if (fieldError.field in EMPTY_FORM) fieldErrors[fieldError.field as keyof ProjectInput] = fieldError.message;
      }
      setErrors(fieldErrors);
      setSubmitError(apiError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={isEdit ? 'Edit project' : 'New project'}
      description={isEdit ? 'Update the project details.' : 'Register an application whose VAPT reports you want to manage.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {submitError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {submitError}
          </p>
        )}
        <div className="sm:col-span-2">
          <TextField
            label="Project name"
            required
            maxLength={200}
            value={form.name}
            error={errors.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </div>
        <TextField
          label="Application name"
          maxLength={200}
          value={form.application_name}
          error={errors.application_name}
          onChange={(event) => set('application_name', event.target.value)}
        />
        <TextField
          label="Owner"
          maxLength={200}
          value={form.owner}
          error={errors.owner}
          hint="Person or team responsible"
          onChange={(event) => set('owner', event.target.value)}
        />
        <SelectField
          label="Environment"
          options={PROJECT_ENVIRONMENTS}
          placeholder="Not set"
          value={form.environment}
          error={errors.environment}
          onChange={(event) => set('environment', event.target.value as ProjectEnvironment | '')}
        />
        <SelectField
          label="Status"
          options={PROJECT_STATUSES}
          value={form.status}
          error={errors.status}
          onChange={(event) => set('status', event.target.value as ProjectStatus)}
        />
        <div className="sm:col-span-2">
          <TextField
            label="Application URL"
            type="url"
            inputMode="url"
            placeholder="https://"
            maxLength={2048}
            value={form.application_url}
            error={errors.application_url}
            onChange={(event) => set('application_url', event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <TextAreaField
            label="Description"
            maxLength={5000}
            value={form.description}
            error={errors.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
