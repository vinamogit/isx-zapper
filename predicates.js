const not = (predicate) => {
    return !check(predicate);
}

const and = (predicate) => {

    var validation = [];
    for (var p of predicate) {
        validation.push(check(p));
    }

    for (var valid of validation) {
        if (!valid) {
            return false;
        }
    }

    return true;
}

const or = (predicate) => {

    var validation = [];
    for (var p of predicate) {
        validation.push(check(p));
    }

    for (var valid of validation) {
        if (valid) {
            return true;
        }
    }

    return false;
}

const check = (predicate) => {

    if (predicate.unconditional) {
        return predicate.unconditional;
    }
    if (predicate.or) {
        return or(predicate.or);
    }
    if (predicate.and) {
        return and(predicate.and);
    }
    if (predicate.not) {
        return not(predicate.not);
    }

    let now = Date.now() / 1000;
    if (predicate.abs_before_epoch) {
        return now < Number(predicate.abs_before_epoch);
    }
    if (predicate.abs_after_epoch) {
        return now > Number(predicate.abs_after_epoch);
    }

    return false;
}

export default function canClaim(predicate) {
    return check(predicate)
}