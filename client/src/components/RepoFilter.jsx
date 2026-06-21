/**
 * RepoFilter — dropdown to filter reviews by repository name.
 */
export default function RepoFilter({ value, onChange, repos = [] }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="repo-filter" className="text-sm text-slate-400 whitespace-nowrap">
        Repository
      </label>
      <select
        id="repo-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input py-2 text-sm min-w-[180px] cursor-pointer"
      >
        <option value="">All Repositories</option>
        {repos.map((repo) => (
          <option key={repo} value={repo}>
            {repo}
          </option>
        ))}
      </select>
    </div>
  );
}
