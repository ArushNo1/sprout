"""Messages between the Store and Curriculum agents.

uAgents matches messages by schema, so these classes must stay identical
(name and fields) to the copies in uagents-python/curriculum/agent.py.
"""

from uagents import Model


class GetConceptMap(Model):
    user: str  # ASI:One address of the student


class ConceptMapReply(Model):
    found: bool
    concept_map: str = ""  # JSON matching curriculum/concept_map.schema.json
