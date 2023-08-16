(define (domain deliveroo) 
(:requirements :adl)
(:types 
    tile - object
)

(:predicates 
    (agentAt ?tile - tile)
    (up ?fromTile - tile ?toTile - tile)
    (down ?fromTile - tile ?toTile - tile)
    (left ?fromTile - tile ?toTile - tile)
    (right ?fromTile - tile ?toTile - tile)  
    (at ?tile - tile)
)

(:action up
    :parameters (?fromTile - tile ?toTile - tile)
    :precondition (and (at ?fromTile) (down ?toTile ?fromTile) (not (agentAt ?toTile)))
    :effect (and (not (at ?fromTile)) (at ?toTile))
)

(:action down
    :parameters (?fromTile - tile ?toTile - tile)
    :precondition (and (at ?fromTile) (up ?toTile ?fromTile) (not (agentAt ?toTile)))
    :effect (and (not (at ?fromTile)) (at ?toTile) )
)

(:action left
    :parameters (?fromTile - tile ?toTile - tile)
    :precondition (and (at ?fromTile) (right ?toTile ?fromTile) (not (agentAt ?toTile)))
    :effect (and (not (at ?fromTile)) (at ?toTile))
)

(:action right
    :parameters (?fromTile - tile ?toTile - tile)
    :precondition (and (at ?fromTile) (left ?toTile ?fromTile) (not (agentAt ?toTile)))
    :effect (and (not (at ?fromTile)) (at ?toTile))
)

)