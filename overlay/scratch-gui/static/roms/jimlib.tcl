# JIMLIB.TCL — the Tcl-coded part of Jim's stdlib.tcl and tclcompat.tcl that
# a DOS program can use, one command per `#@` section, defined on first call
# (the `unknown` handler in mkdos.py reads this file from the DOS disk) instead
# of parsed at startup: on a 16-bit heap the parsed library alone used every
# byte. Shipped as static/roms/jimlib.tcl. Bodies are Jim Tcl's own
# (BSD-2-Clause, (c) Steve Bennett and the Jim Tcl authors), unchanged.
#@ gets flush close eof seek tell
foreach p {gets flush close eof seek tell} {
	proc $p {chan args} {p} {
		tailcall $chan $p {*}$args
	}
}
#@ read
proc read {{-nonewline {}} chan} {
	if {${-nonewline} ni {-nonewline {}}} {
		tailcall ${-nonewline} read {*}${chan}
	}
	tailcall $chan read {*}${-nonewline}
}
#@ fconfigure
proc fconfigure {f args} {
	foreach {n v} $args {
		switch -glob -- $n {
			-bl* { $f ndelay $(!$v) }
			-bu* { $f buffering $v }
			-tr* { $f translation $v }
			default { return -code error "fconfigure: unknown option $n" }
		}
	}
}
#@ fileevent
proc fileevent {args} {
	tailcall {*}$args
}
#@ parray
proc parray {arrayname {pattern *} {puts puts} args} {
	upvar $arrayname a
	set max 0
	foreach name [array names a $pattern]] {
		if {[string length $name] > $max} {
			set max [string length $name]
		}
	}
	incr max [string length $arrayname]
	incr max 2
	foreach name [lsort [array names a $pattern]] {
		$puts {*}$args [format "%-${max}s = %s" $arrayname\($name\) $a($name)]
	}
}
#@ throw
proc throw {code {msg ""}} {
	return -code $code $msg
}
#@ ref
proc ref {args} {{count 0}} {
	format %08x [incr count]
}
#@ lambda
proc lambda {arglist args} {
	tailcall proc [ref {} function lambda.finalizer] $arglist {*}$args
}
#@ lambda.finalizer
proc lambda.finalizer {name val} {
	rename $name {}
}
#@ curry
proc curry {args} {
	alias [ref {} function lambda.finalizer] {*}$args
}
#@ function
proc function {value} {
	return $value
}
#@ stackdump
proc stackdump {stacktrace} {
	set lines {}
	lappend lines "Traceback (most recent call last):"
	foreach {cmd l f p} [lreverse $stacktrace] {
		set line {}
		if {$f ne ""} {
			append line "  File \"$f\", line $l"
		}
		if {$p ne ""} {
			append line ", in $p"
		}
		if {$line ne ""} {
			lappend lines $line
			if {$cmd ne ""} {
				set nl [string first \n $cmd 1]
				if {$nl >= 0} {
					set cmd [string range $cmd 0 $nl-1]...
				}
				lappend lines "    $cmd"
			}
		}
	}
	if {[llength $lines] > 1} {
		return [join $lines \n]
	}
}
#@ errorInfo
proc errorInfo {msg {stacktrace ""}} {
	if {$stacktrace eq ""} {
		set stacktrace [info stacktrace]
	}
	lassign $stacktrace p f l cmd
	if {$f ne ""} {
		set result "$f:$l: Error: "
	}
	append result "$msg\n"
	append result [stackdump $stacktrace]
	string trim $result
}
#@ dict update
proc {dict update} {&varName args script} {
	set keys {}
	foreach {n v} $args {
		upvar $v var_$v
		if {[dict exists $varName $n]} {
			set var_$v [dict get $varName $n]
		}
	}
	catch {uplevel 1 $script} msg opts
	if {[info exists varName]} {
		foreach {n v} $args {
			if {[info exists var_$v]} {
				dict set varName $n [set var_$v]
			} else {
				dict unset varName $n
			}
		}
	}
	return {*}$opts $msg
}
#@ dict replace
proc {dict replace} {dictionary {args {key value}}} {
	if {[llength ${key value}] % 2} {
		tailcall {dict replace}
	}
	tailcall dict merge $dictionary ${key value}
}
#@ dict lappend
proc {dict lappend} {varName key {args value}} {
	upvar $varName dict
	if {[exists dict] && [dict exists $dict $key]} {
		set list [dict get $dict $key]
	}
	lappend list {*}$value
	dict set dict $key $list
}
#@ dict append
proc {dict append} {varName key {args value}} {
	upvar $varName dict
	if {[exists dict] && [dict exists $dict $key]} {
		set str [dict get $dict $key]
	}
	append str {*}$value
	dict set dict $key $str
}
#@ dict incr
proc {dict incr} {varName key {increment 1}} {
	upvar $varName dict
	if {[exists dict] && [dict exists $dict $key]} {
		set value [dict get $dict $key]
	}
	incr value $increment
	dict set dict $key $value
}
#@ dict remove
proc {dict remove} {dictionary {args key}} {
	foreach k $key {
		dict unset dictionary $k
	}
	return $dictionary
}
#@ dict for
proc {dict for} {vars dictionary script} {
	if {[llength $vars] != 2} {
		return -code error "must have exactly two variable names"
	}
	dict size $dictionary
	tailcall foreach $vars $dictionary $script
}
#@ after
# A program's own sleep. The bench has no event loop and its clock is
# simulated, so `after ms` returns at once; `after ms script` needs the event
# loop and says so.
proc after {ms args} {
	if {[llength $args]} {
		return -code error "after with a script needs an event loop, which DOS Tcl does not have"
	}
}
#@ tcl::mathop::+ ::tcl::mathop::+
proc ::tcl::mathop::+ {args} {
	set r 0
	foreach a $args { set r [expr {$r + $a}] }
	return $r
}
#@ tcl::mathop::* ::tcl::mathop::*
proc ::tcl::mathop::* {args} {
	set r 1
	foreach a $args { set r [expr {$r * $a}] }
	return $r
}
#@ tcl::mathop::- ::tcl::mathop::-
proc ::tcl::mathop::- {a args} {
	if {![llength $args]} { return [expr {-$a}] }
	foreach b $args { set a [expr {$a - $b}] }
	return $a
}
#@ tcl::mathop::/ ::tcl::mathop::/
proc ::tcl::mathop::/ {a args} {
	if {![llength $args]} { return [expr {1.0 / $a}] }
	foreach b $args { set a [expr {$a / $b}] }
	return $a
}
#@ tcl::mathfunc::max ::tcl::mathfunc::max
proc ::tcl::mathfunc::max {a args} {
	foreach b $args { if {$b > $a} { set a $b } }
	return $a
}
#@ tcl::mathfunc::min ::tcl::mathfunc::min
proc ::tcl::mathfunc::min {a args} {
	foreach b $args { if {$b < $a} { set a $b } }
	return $a
}
#@ namespace delete
# Implements script-based implementations of various namespace
# subcommands
#
# (c) 2011 Steve Bennett <steveb@workware.net.au>
#

proc {namespace delete} {args} {
	foreach name $args {
		if {$name ni {:: ""}} {
			set name [uplevel 1 [list ::namespace canon $name]]
			foreach i [info commands ${name}::*] { rename $i "" }
			uplevel #0 [list unset {*}[info globals ${name}::*]]
		}
	}
}
#@ namespace origin
proc {namespace origin} {name} {
	set nscanon [uplevel 1 [list ::namespace canon $name]]
	if {[exists -alias $nscanon]} {
		tailcall {namespace origin} [info alias $nscanon]
	}
	if {[exists -command $nscanon]} {
		return ::$nscanon
	}
	if {[exists -command $name]} {
		return ::$name
	}

	return -code error "invalid command name \"$name\""
}
#@ namespace which
proc {namespace which} {{type -command} name} {
	set nsname ::[uplevel 1 [list ::namespace canon $name]]
	if {$type eq "-variable"} {
		return $nsname
	}
	if {$type eq "-command"} {
		if {[exists -command $nsname]} {
			return $nsname
		} elseif {[exists -command ::$name]} {
			return ::$name
		}
		return ""
	}
	return -code error {wrong # args: should be "namespace which ?-command? ?-variable? name"}
}
#@ namespace code
proc {namespace code} {arg} {
	if {[string first "::namespace inscope " $arg] == 0} {
		# Already scoped
		return $arg
	}
	list ::namespace inscope [uplevel 1 ::namespace current] $arg
}
#@ namespace inscope
proc {namespace inscope} {name arg args} {
	tailcall namespace eval $name $arg $args
}
#@ namespace import
proc {namespace import} {args} {
	set current [uplevel 1 ::namespace canon]

	foreach pattern $args {
		foreach cmd [info commands [namespace canon $current $pattern]] {
			if {[namespace qualifiers $cmd] eq $current} {
				return -code error "import pattern \"$pattern\" tries to import from namespace \"$current\" into itself"
			}
			# What if this alias would create a loop?
			# follow the target alias chain to see if we are creating a loop
			set newcmd ${current}::[namespace tail $cmd]

			set alias $cmd
			while {[exists -alias $alias]} {
				set alias [info alias $alias]
				if {$alias eq $newcmd} {
					return -code error "import pattern \"$pattern\" would create a loop"
				}
			}

			alias $newcmd $cmd
		}
	}
}

# namespace-aware info commands: procs, channels, globals, locals, vars
#@ namespace info
proc {namespace info} {cmd {pattern *}} {
	set current [uplevel 1 ::namespace canon]
	# Now we may need to strip $pattern
	if {[string first :: $pattern] == 0} {
		set global 1
		set prefix ::
	} else {
		set global 0
		set clen [string length $current]
		incr clen 2
	}
	set fqp [namespace canon $current $pattern]
	switch -glob -- $cmd {
		co* - p* {
			if {$global} {
				set result [info $cmd $fqp]
			} else {
				# Add commands in the current namespace
				set r {}
				foreach c [info $cmd $fqp] {
					dict set r [string range $c $clen end] 1
				}
				if {[string match co* $cmd]} {
					# Now in the global namespace
					foreach c [info -nons commands $pattern] {
						dict set r $c 1
					}
				}
				set result [dict keys $r]
			}
		}
		ch* {
			set result [info channels $pattern]
		}
		v* {
			#puts "uplevel #0 info gvars $fqp"
			set result [uplevel #0 info -nons vars $fqp]
		}
		g* {
			set result [info globals $fqp]
		}
		l* {
			set result [uplevel 1 info -nons locals $pattern]
		}
	}
	if {$global} {
		set result [lmap p $result { string cat $prefix $p }]
	}
	return $result
}
#@ namespace upvar
proc {namespace upvar} {ns args} {
	set nscanon ::[uplevel 1 [list ::namespace canon $ns]]
	set script [list upvar 0]
	foreach {other local} $args {
		lappend script ${nscanon}::$other $local
	}
	tailcall {*}$script
}
#@ namespace ensemble
proc {namespace ensemble} {subcommand args} {
	if {$subcommand ne "create"} {
		return -code error "only \[namespace ensemble create\] is supported"
	}
	set ns [uplevel 1 namespace canon]
	set cmd $ns
	if {$ns eq ""} {
		return -code error "namespace ensemble create: must be called within a namespace"
	}

	# Create the mapping
	ensemble $cmd -automap ${ns}:: {*}$args
}
