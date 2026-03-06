---
name: python-testing
description: Use when writing or reviewing tests in a Python project. Covers pytest conventions, factories with factory_boy, fixtures, mocking, async tests, and parametrize.
---

# Python Testing

**Framework:** pytest. Use factory_boy for factories, pytest-mock for mocking, pytest-asyncio for async tests.

See testing-best-practices for universal rules on test structure, hermeticity, and mocking boundaries.

## Factories

Use factory_boy to define factories. Factories live in a `tests/factories/` directory or a `factories.py` file per module. Register them as pytest fixtures where appropriate.

```python
import factory
from myapp.models import User

class UserFactory(factory.Factory):
    class Meta:
        model = User

    id = factory.Sequence(lambda n: f"user-{n}")
    email = factory.LazyAttribute(lambda o: f"{o.id}@example.com")
    role = "member"
    is_admin = False
```

For variants, add named methods or subclasses rather than conditionals inside the factory:

```python
class AdminUserFactory(UserFactory):
    is_admin = True
```

## Fixtures

Use pytest fixtures for setup and teardown. Keep fixtures small and composable. Split `conftest.py` by concern rather than a single large file — a fixture-heavy `conftest.py` is a sign it should be broken up.

## Mocking

Use `pytest-mock` (`mocker` fixture) or `unittest.mock.patch` as a context manager. Patch at the point of use, not at the point of definition.

```python
# Good — patch where it is used
def test_sends_email(mocker):
    send = mocker.patch("myapp.notifications.send_email")
    trigger_notification()
    send.assert_called_once()

# Bad — patch at the point of definition
def test_sends_email(mocker):
    send = mocker.patch("email_lib.send")
    trigger_notification()
    send.assert_called_once()
```

## Async

Use `pytest-asyncio` for async tests. Mark async tests with `@pytest.mark.asyncio`.

```python
@pytest.mark.asyncio
async def test_fetches_user():
    user = await get_user(id="user-1")
    assert user.email == "user-1@example.com"
```

## Parametrize

Use `@pytest.mark.parametrize` to cover multiple input cases without duplicating test bodies. Give each parameter set an `id` for readable failure output.

```python
@pytest.mark.parametrize("email,valid", [
    ("user@example.com", True),
    ("not-an-email", False),
    ("", False),
], ids=["valid", "malformed", "empty"])
def test_email_validation(email, valid):
    assert validate_email(email) == valid
```
