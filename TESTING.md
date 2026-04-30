# Testing

The backend test suite uses pytest and Flask's `test_client`.

From the project root, install the backend dependencies:

```bash
pip install -r backend/requirements.txt
```

Then run the tests:

```bash
pytest
```

The tests add `backend/` to Python's import path and use an in-memory SQLite database, so they do not need the Flask development server to be running.
