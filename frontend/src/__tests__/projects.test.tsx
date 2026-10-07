import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/render';
import { projectService } from '../services/projectService';
import { ApiError } from '../types/api';
import { buildProject, pageOf } from '../test/fixtures';

vi.mock('../services/projectService');

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.mocked(projectService.list).mockReset();
    vi.mocked(projectService.create).mockReset();
    vi.mocked(projectService.update).mockReset();
    vi.mocked(projectService.remove).mockReset();
  });

  it('lists projects from the API', async () => {
    vi.mocked(projectService.list).mockResolvedValue(pageOf([buildProject(), buildProject({ id: 2, name: 'Internal Wiki', status: 'Archived' })]));
    renderApp('/projects');
    expect(await screen.findByRole('link', { name: 'Customer Portal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Internal Wiki' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Showing 1–2 of 2');
  });

  it('shows an empty state when there are no projects', async () => {
    vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
    renderApp('/projects');
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('creates a project and reloads the list', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.list).mockResolvedValueOnce(pageOf([])).mockResolvedValue(pageOf([buildProject()]));
    vi.mocked(projectService.create).mockResolvedValue(buildProject());

    renderApp('/projects');
    await screen.findByText('No projects yet');
    await user.click(screen.getAllByRole('button', { name: /New Project/ })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText(/Project name/), 'Customer Portal');
    await user.selectOptions(within(dialog).getByLabelText('Environment'), 'Production');
    await user.type(within(dialog).getByLabelText('Owner'), 'QA Team');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(projectService.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Customer Portal', environment: 'Production', owner: 'QA Team', status: 'Active' }),
    );
    expect(await screen.findByRole('link', { name: 'Customer Portal' })).toBeInTheDocument();
  });

  it('validates required fields before calling the API', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
    renderApp('/projects?new=1');

    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Application URL'), 'ftp://example.com');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(within(dialog).getByText('Project name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('URL must start with http:// or https://')).toBeInTheDocument();
    expect(projectService.create).not.toHaveBeenCalled();
  });

  it('shows server errors such as duplicate names', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
    vi.mocked(projectService.create).mockRejectedValue(
      new ApiError('A project named "Customer Portal" already exists.', 409, 'conflict', [
        { field: 'name', message: 'Project name must be unique' },
      ]),
    );
    renderApp('/projects?new=1');

    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText(/Project name/), 'Customer Portal');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already exists');
    expect(within(dialog).getByText('Project name must be unique')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edits an existing project', async () => {
    const user = userEvent.setup();
    const project = buildProject();
    vi.mocked(projectService.list).mockResolvedValue(pageOf([project]));
    vi.mocked(projectService.update).mockResolvedValue({ ...project, owner: 'Security Team' });
    renderApp('/projects');

    await user.click(await screen.findByRole('button', { name: 'Edit Customer Portal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit project' });
    const owner = within(dialog).getByLabelText('Owner');
    expect(owner).toHaveValue('QA Team');
    await user.clear(owner);
    await user.type(owner, 'Security Team');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(projectService.update).toHaveBeenCalledWith(1, expect.objectContaining({ owner: 'Security Team' })));
  });

  it('deletes a project after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.list).mockResolvedValueOnce(pageOf([buildProject()])).mockResolvedValue(pageOf([]));
    vi.mocked(projectService.remove).mockResolvedValue();
    renderApp('/projects');

    await user.click(await screen.findByRole('button', { name: 'Delete Customer Portal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete project' });
    expect(projectService.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(projectService.remove).toHaveBeenCalledWith(1));
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('sends filters to the API instead of filtering in the browser', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.list).mockResolvedValue(pageOf([]));
    renderApp('/projects');
    await screen.findByText('No projects yet');

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'Archived');
    await waitFor(() =>
      expect(projectService.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Archived', page: 1 })),
    );
    expect(await screen.findByText('No matching projects')).toBeInTheDocument();
  });

  it('shows an error state when the list fails', async () => {
    vi.mocked(projectService.list).mockRejectedValue(new ApiError('An unexpected error occurred.', 500, 'internal_error'));
    renderApp('/projects');
    expect(await screen.findByText('Projects could not be loaded')).toBeInTheDocument();
  });
});
